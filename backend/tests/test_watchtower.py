"""Watchtower: the rules that decide what SCASPA data reaches a reader.

The pipeline mechanics matter, but the assertions worth writing are about
governance. This service reads an endpoint that returns **more than SCASPA
publishes** — crew names, pilots, agents, records the Authority has marked
hidden — and the only thing standing between that payload and a customer's
screen is the parser in `app/watchtower/parsers.py`.

So most of this file is about what does NOT come out of it.
"""

import asyncio
import contextlib
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import Settings
from app.schemas import CruiseCall, DataSource
from app.watchtower import store
from app.watchtower.parsers import ParseError, is_publishable, parse_cruise_api


def _settings(tmp_path: Path, **overrides) -> Settings:  # noqa: ANN003
    """A throwaway operational database, and no developer .env in sight."""
    return Settings(
        _env_file=None,
        OPERATIONAL_DB_PATH=str(tmp_path / "ops.db"),
        **overrides,
    )


# A record shaped exactly like the endpoint's, including the fields this
# product must never surface.
FULL_RECORD = {
    "sheetRow": 1328,
    "requestId": "REQ-CE6869",
    "date": "2026-01-01",
    "day": "Thursday",
    "time": "07:00 - 18:00",
    "vesselName": "LE BOUGAINVILLE",
    "cruiseLine": "Ponant",
    "pier": "PR1E",
    "inaugural": "No",
    "pax": "184",
    "capacity": "184",
    "status": "Active",
    "visibility": "Public",
    # Everything below is returned by the endpoint and published by nobody.
    "captainName": "A Captain",
    "pilot": "A Pilot",
    "agentName": "An Agent",
    "shipWorkers": "12",
    "actualIn": "",
    "actualOut": "",
    "lastPortOfCall": "Somewhere",
    "nextPortOfCall": "Elsewhere",
    "submittedAt": "2025-11-02T10:00:00Z",
}


def payload(*records: dict) -> str:
    return json.dumps(list(records))


class TestWhatReachesAReader:
    def test_publishes_only_the_columns_scaspa_publishes(self) -> None:
        """The endpoint returns crew names. The published table does not.

        `CruiseCall` has no field for them, which is the real guard — but this
        asserts it at the boundary, because "the model has no field" is a fact
        someone could change in a hurry to satisfy a feature request.
        """
        [call] = parse_cruise_api(payload(FULL_RECORD))

        rendered = call.model_dump_json().lower()
        for leaked in ("captain", "pilot", "agent", "shipworkers", "requestid", "sheetrow"):
            assert leaked not in rendered, f"{leaked} reached a customer-facing model"

    def test_withholds_records_scaspa_marked_hidden(self) -> None:
        # SCASPA's own widget drops these. Overruling the publisher about its
        # own data would be this service deciding what the Authority meant.
        hidden = {**FULL_RECORD, "visibility": "Hidden"}
        assert parse_cruise_api(payload(hidden)) == []
        assert is_publishable(hidden) is False

    @pytest.mark.parametrize("status", ["Cancelled", "cancelled", "Pending", "PENDING"])
    def test_withholds_cancelled_and_pending_calls(self, status: str) -> None:
        # A cancelled call shown as scheduled sends somebody to a pier for a
        # ship that is not coming.
        assert parse_cruise_api(payload({**FULL_RECORD, "status": status})) == []

    @pytest.mark.parametrize("status", ["Active", "Planned", "Executed"])
    def test_publishes_the_statuses_scaspa_shows(self, status: str) -> None:
        assert len(parse_cruise_api(payload({**FULL_RECORD, "status": status}))) == 1

    def test_one_bad_record_does_not_lose_the_rest(self) -> None:
        """A data-entry slip is not an outage.

        Four hundred good calls are still worth having when one row has a
        malformed date.
        """
        good = {**FULL_RECORD, "vesselName": "GOOD SHIP"}
        bad = {**FULL_RECORD, "date": "not-a-date", "vesselName": "BAD DATE"}
        calls = parse_cruise_api(payload(good, bad))
        assert [c.vessel for c in calls] == ["GOOD SHIP"]


class TestZeroIsNotAnAnswer:
    def test_published_zero_passengers_means_unknown(self) -> None:
        """The table carries 0 where the count is not yet known.

        Rendering that as "0 passengers" states something SCASPA did not — the
        same class of error as the berth-occupancy tile that must never show 0.
        """
        [call] = parse_cruise_api(payload({**FULL_RECORD, "pax": "0"}))
        assert call.pax is None

    def test_missing_capacity_is_absent_not_zero(self) -> None:
        [call] = parse_cruise_api(payload({**FULL_RECORD, "capacity": ""}))
        assert call.capacity is None


class TestFailingLoudly:
    def test_a_payload_that_is_not_records_raises(self) -> None:
        """An empty list and an unreadable payload mean opposite things.

        "SCASPA has published no calls" is data. "We can no longer read the
        source" is an incident, and returning [] for it would empty the
        schedule while looking like a normal quiet week.
        """
        with pytest.raises(ParseError):
            parse_cruise_api('{"unexpected": "shape"}')

    def test_non_json_raises(self) -> None:
        with pytest.raises(ParseError):
            parse_cruise_api("<html>Service Unavailable</html>")

    def test_a_genuinely_empty_schedule_is_not_an_error(self) -> None:
        assert parse_cruise_api("[]") == []

    def test_the_date_format_is_pinned(self) -> None:
        """DD/MM/YYYY must not be silently accepted as ISO.

        The HTML table published day-first and this endpoint publishes ISO. A
        permissive parser meeting `05/08/2026` would have to guess between the
        5th of August and the 8th of May, and a schedule shifted by three
        months is the worst failure available here.
        """
        assert parse_cruise_api(payload({**FULL_RECORD, "date": "05/08/2026"})) == []


class TestProvenanceIsStructural:
    def test_a_published_source_must_say_when_it_was_fetched(self) -> None:
        """`published` is not `live`, and the timestamp is what says so.

        A six-hour-old snapshot with no date on it is indistinguishable from a
        live feed to anyone reading the screen, so the schema refuses to build
        one rather than leaving it to whoever writes the next source.
        """
        with pytest.raises(ValueError, match="as_of"):
            DataSource(kind="published", label="Official SCASPA cruise schedule", as_of=None)

    def test_a_published_source_with_a_timestamp_is_fine(self) -> None:
        source = DataSource(
            kind="published",
            label="Official SCASPA cruise schedule",
            as_of=date(2026, 8, 27),
        )
        # No notice: the data is real, so there is nothing to warn about.
        assert source.notice is None


def test_a_call_carries_only_what_was_published() -> None:
    """The model itself, independent of the parser."""
    fields = set(CruiseCall.model_fields)
    assert fields == {
        "call_date",
        "day",
        "window",
        "vessel",
        "cruise_line",
        "pier",
        "inaugural",
        "pax",
        "capacity",
    }


# ── The verification path ────────────────────────────────────────────────────
#
# These are about the numeric grounding gate, not about Watchtower — but they
# belong beside the parser, because they exist for the same reason: a cruise
# call is a set of FIGURES, and the whole product rests on a figure being
# traceable to something SCASPA published.


class TestStructuredEvidenceIsVerifiable:
    """Tool output is a source figures may be checked against.

    When the cruise tool first shipped, every answer it produced was discarded
    by the grounding gate and replaced with "I could not verify one of the
    figures". The gate was right: a sailing time from a tool it had never heard
    of is exactly the unverifiable figure it exists to stop.

    The fix was to tell the gate where the figures came from, not to weaken it,
    and these assert that distinction holds in both directions.
    """

    EVIDENCE = [
        "Published SCASPA cruise calls for 2026-12-25:\n"
        "- 2026-12-25 (Friday) 09:00 - 18:00: CELEBRITY ECLIPSE — Celebrity Cruise, "
        "pier PORTZANTE, passenger count not published\n"
        "Source: Official SCASPA cruise schedule, checked 27 Aug 2026 at 05:12 UTC."
    ]

    def test_a_figure_from_the_schedule_verifies(self) -> None:
        from app.rag.answer import find_unverified_figures

        answer = "Celebrity Eclipse calls at Port Zante, 09:00 - 18:00."
        assert find_unverified_figures(answer, [], self.EVIDENCE) == []

    def test_a_figure_from_nowhere_still_fails(self) -> None:
        """The gate is not switched off for cruise answers.

        A time that appears in neither the schedule nor a retrieved row is still
        caught, which is the half of this that matters.
        """
        from app.rag.answer import find_unverified_figures

        answer = "Celebrity Eclipse calls at Port Zante, 06:15 - 23:45."
        assert find_unverified_figures(answer, [], self.EVIDENCE) != []

    def test_with_no_evidence_nothing_changes(self) -> None:
        from app.rag.answer import find_unverified_figures

        answer = "The fare is XCD 44.44."
        assert find_unverified_figures(answer, [], None) != []


# ── The schedule itself ──────────────────────────────────────────────────────
#
# `check_all()` existed and was tested from the day it was written, and nothing
# called it. The store held a cruise schedule because a person had run the
# monitor by hand, and the Vessels page stamped every row "checked at 05:12"
# against a fetch that was never going to happen again.
#
# That is the worst shape a bug can take in this product: the screen goes on
# making a confident, dated claim while the thing behind it has stopped. So the
# assertions below are about the sweep continuing to happen — not about it
# working, which is what everything above covers.


class TestTheSweepKeepsHappening:
    def test_a_failing_tick_does_not_kill_the_loop(self, tmp_path: Path) -> None:
        """A dead scheduler is SILENT, which is why this matters.

        If an unexpected exception escaped `tick`, the task would end and the
        application would carry on serving perfectly — with a schedule frozen at
        whatever it last was. Nothing would be logged again, no endpoint would
        report differently, and the only symptom would be a date on a screen
        slowly getting older.
        """
        import app.watchtower.scheduler as sched

        calls = {"n": 0}

        async def failing_tick(settings=None):  # noqa: ANN001, ANN202
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("the endpoint did something new")

        async def drive() -> None:
            with (
                patch.object(sched, "tick", failing_tick),
                patch.object(sched, "STARTUP_DELAY_SECONDS", 0),
                patch.object(sched, "TICK_SECONDS", 0),
            ):
                task = asyncio.create_task(sched.run_forever(_settings(tmp_path)))
                # Long enough for several ticks at a zero interval.
                await asyncio.sleep(0.05)
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

        asyncio.run(drive())
        assert calls["n"] > 1, "the loop stopped after the first failure"

    def test_nothing_is_fetched_at_boot(self, tmp_path: Path) -> None:
        """The first sweep waits.

        A container in a crash-loop would otherwise hit SCASPA's endpoint once
        per restart, and a deployment scaling to six replicas would hit it six
        times in the same second. The delay is also what makes it safe for a
        smoke test to start the app and stop it.
        """
        import app.watchtower.scheduler as sched

        swept = {"n": 0}

        async def counting_tick(settings=None):  # noqa: ANN001, ANN202
            swept["n"] += 1

        async def drive() -> None:
            with patch.object(sched, "tick", counting_tick):
                task = asyncio.create_task(sched.run_forever(_settings(tmp_path)))
                await asyncio.sleep(0.05)
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

        asyncio.run(drive())
        assert swept["n"] == 0, "a sweep ran before the startup delay elapsed"

    def test_the_scheduler_can_be_switched_off(self, tmp_path: Path) -> None:
        # The test suite depends on this, and so does anyone putting the CLI in
        # cron instead. `None` rather than a task that does nothing, so the
        # caller can tell "off" from "running".
        import app.watchtower.scheduler as sched

        settings = _settings(tmp_path, WATCHTOWER_ENABLED=False)
        assert sched.start(object(), settings) is None


class TestTheRowCountIsTheRowCount:
    def test_duplicate_calls_are_folded_and_counted_once(self, tmp_path: Path) -> None:
        """SCASPA's schedule really does repeat `(date, vessel)` pairs.

        502 records parsed into 496 rows on the day this was written. The store
        keys on date and vessel and folds the repeats, which is correct — but
        `replace_cruise_calls` used to return what it had been HANDED, so the
        change log and the operator's log line both reported six rows that
        existed nowhere.

        A count that is only ever six out is the kind that never gets checked.
        """
        settings = _settings(tmp_path)
        duplicated = [
            CruiseCall(call_date=date(2026, 1, 1), vessel="SAMPLE VOYAGER", window="07:00 - 18:00"),
            # Same day, same ship, different window — a publishing repeat, not a
            # second call. One row survives.
            CruiseCall(call_date=date(2026, 1, 1), vessel="SAMPLE VOYAGER", window="08:00 - 17:00"),
            CruiseCall(call_date=date(2026, 1, 2), vessel="SAMPLE MERIDIAN"),
        ]

        stored = store.replace_cruise_calls(
            duplicated,
            source_id="cruise_schedule",
            source_url="https://www.scaspa.com/cruise-ship-schedule.html",
            content_hash="test",
            settings=settings,
        )

        assert stored == 2, "the return value is the table, not the input"
        assert store.read_cruise_calls(settings=settings)[1] == 2


class TestOnlyOneWorkerSweeps:
    """`uvicorn --workers 4` builds the application four times.

    Without a lease that is four schedulers asking SCASPA for the same schedule
    at the same moment, four times an hour — rude to somebody else's server, and
    it multiplies every retry storm by the worker count.
    """

    def test_the_second_worker_does_not_get_it(self, tmp_path: Path) -> None:
        settings = _settings(tmp_path)
        assert store.acquire_scheduler_lease("worker-a", 600, settings) is True
        assert store.acquire_scheduler_lease("worker-b", 600, settings) is False

    def test_the_holder_may_renew(self, tmp_path: Path) -> None:
        # Otherwise a healthy worker loses the lease to a peer every tick and
        # the sweep bounces between processes for no reason.
        settings = _settings(tmp_path)
        assert store.acquire_scheduler_lease("worker-a", 600, settings) is True
        assert store.acquire_scheduler_lease("worker-a", 600, settings) is True

    def test_an_expired_lease_is_taken_over(self, tmp_path: Path) -> None:
        """A lock would have stopped the schedule forever; a lease runs out.

        A worker killed mid-sweep never releases anything. With a plain lock the
        cruise schedule would simply stop updating, with no error anywhere and
        an application still serving happily — the same silent failure as a dead
        task, arrived at from the other direction.
        """
        settings = _settings(tmp_path)
        assert store.acquire_scheduler_lease("dead-worker", 0, settings) is True
        assert store.acquire_scheduler_lease("live-worker", 600, settings) is True
        assert (store.scheduler_lease(settings=settings) or {})["owner"] == "live-worker"

    def test_a_tick_without_the_lease_checks_nothing(self, tmp_path: Path) -> None:
        import app.watchtower.scheduler as sched

        settings = _settings(tmp_path)
        store.acquire_scheduler_lease("somebody-else", 600, settings)

        with patch.object(sched, "check_all") as check:
            assert asyncio.run(sched.tick(settings)) == []
        check.assert_not_called()
