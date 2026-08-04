"""Vessels, flights, tariffs and support.

The safety-critical assertions here are not about shapes. They are:

* a fixture feed always announces itself, and cannot reach production;
* the calculator never invents a rate, and its total always carries its warning;
* no personal detail is accepted by the ticket endpoint;
* the sample data cannot be mistaken for real SCASPA information.
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.memory import ConversationStore, get_conversation_store
from app.config import Settings, get_settings
from app.main import create_app
from app.ops.fixtures import (
    sample_flight_metrics,
    sample_flights,
    sample_tariffs,
    sample_vessel_metrics,
    sample_vessels,
)
from app.ops.source import (
    FixtureOpsSource,
    UnavailableOpsSource,
    build_ops_source,
    filter_flights,
    filter_tariffs,
    filter_vessels,
    get_ops_source,
)
from app.ops.tariffs import (
    DOCKAGE_BY_VESSEL_TYPE,
    DOCKAGE_CODE,
    DOCKAGE_CRUISE_CODE,
    HANDLING_CODE,
    HARBOUR_DUES_CODE,
    PILOTAGE_CODE,
    STORAGE_CODE,
    VESSEL_TYPES,
    WHARFAGE_20FT_CODE,
    WHARFAGE_40FT_CODE,
    build_quote,
    total_of,
)
from app.schemas import DataSource, TariffQuoteRequest


def _client(settings: Settings, source) -> TestClient:  # noqa: ANN001
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_ops_source] = lambda: source
    app.dependency_overrides[get_conversation_store] = lambda: ConversationStore(settings)
    return TestClient(app)


@pytest.fixture
def fixture_api(tmp_settings) -> TestClient:
    return _client(tmp_settings, FixtureOpsSource())


@pytest.fixture
def empty_api(tmp_settings) -> TestClient:
    return _client(tmp_settings, UnavailableOpsSource())


# ------------------------------------------------------- the source contract


def test_a_fixture_source_cannot_be_silent() -> None:
    """The notice is structural, not a convention someone has to remember."""
    with pytest.raises(ValueError, match="notice"):
        DataSource(kind="fixture", label="Sample", notice=None)
    with pytest.raises(ValueError, match="notice"):
        DataSource(kind="unavailable", label="None", notice="   ")


def test_a_live_source_needs_no_notice() -> None:
    """Only the untrustworthy kinds have to explain themselves."""
    assert DataSource(kind="live", label="AIS feed").notice is None


def test_fixture_responses_carry_the_sample_warning(fixture_api: TestClient) -> None:
    for path in ("/api/vessels", "/api/flights", "/api/tariffs"):
        source = fixture_api.get(path).json()["source"]
        assert source["kind"] == "fixture"
        assert "SAMPLE DATA" in source["notice"]


def test_no_feed_is_an_empty_200_not_an_error(empty_api: TestClient) -> None:
    """Nothing is broken when SCASPA has published no feed.

    A 503 would put a red error panel in front of a user over a feature that was
    never switched on. The design already has an empty state for this.
    """
    for path, key in (("/api/vessels", "vessels"), ("/api/flights", "flights")):
        response = empty_api.get(path)
        assert response.status_code == 200
        body = response.json()
        assert body[key] == []
        assert body["source"]["kind"] == "unavailable"
        assert body["source"]["notice"]


def test_unknown_metrics_are_null_never_zero(empty_api: TestClient) -> None:
    """ "0 vessels at berth" reads as an empty port. "Unknown" is the truth."""
    metrics = empty_api.get("/api/vessels").json()["metrics"]
    assert metrics["vessels_at_berth"] is None
    assert metrics["berth_capacity"] is None


def test_an_unknown_source_name_degrades_rather_than_crashing(tmp_settings) -> None:
    """A typo in a feature flag must not take the chat path down with it."""
    tmp_settings.OPS_DATA_SOURCE = "aisfeed"  # not a real value
    assert isinstance(build_ops_source(tmp_settings), UnavailableOpsSource)


# ------------------------------------------------------------ rule 5: fakery


def test_the_sample_feed_cannot_be_mistaken_for_real_information(
    fixture_api: TestClient,
) -> None:
    """CLAUDE.md rule 5 and decision record 0032, checked rather than trusted.

    **This test guards the half of the fixture that must stay synthetic.** The
    other half — berths, gates, times, statuses — is deliberately realistic and
    is not asserted here, because asserting it would be asserting that the
    fixture looks fake, which 0032 explicitly stopped requiring.

    The design exports use real vessels and real airlines. Reproducing them
    would render an arrivals board indistinguishable from a real one, and now
    that the surrounding data behaves realistically, the names are carrying more
    of that load rather than less.
    """
    vessels = fixture_api.get("/api/vessels").json()["vessels"]
    assert vessels, "the fixture feed should return something"
    for vessel in vessels:
        assert "SAMPLE" in vessel["name"].upper(), vessel["name"]
        # A real IMO is seven digits with a check digit. These resolve nowhere.
        assert vessel["imo"].startswith("IMO 000"), vessel["imo"]
        assert "Placeholder" in vessel["agent"], vessel["agent"]

    flights = fixture_api.get("/api/flights").json()["flights"]
    # Not one code: a board showing a single carrier does not exercise the
    # avatar column. Every code used must still be one IATA does not assign.
    unassigned = {"ZZ", "QQ", "XX", ""}
    for flight in flights:
        assert flight["airline_code"] in unassigned, flight["airline_code"]
        assert any(word in flight["airline"] for word in ("Placeholder", "Sample", "Example")), (
            flight["airline"]
        )
        # The route is shaped like a route; the place is not a place.
        assert flight["port"] not in {"Antigua", "San Juan", "Miami", "New York"}


def test_every_money_amount_in_the_fixture_is_repeated_digit() -> None:
    """0032 layer 3, the one field type with no exceptions.

    Times are realistic, berths are realistic, counts that shape a tile are
    realistic. **Money is not**, at any magnitude, because a figure is the thing
    a reader writes down and acts on — and `XCD 222.22 per container` exercises
    the calculator, the alignment and the totalling while being unquotable on
    sight.

    Checked against the digits after the decimal point matching the digits
    before it, which is what "repeated-digit" means in practice for this data.
    """
    quotable: list[tuple[str, float]] = [(row.code, row.amount) for row in sample_tariffs()]
    # Statistics are quotable too — "the port handles N TEU a day" is exactly
    # the sentence that must not survive a screenshot.
    metrics = sample_vessel_metrics()
    if metrics.daily_cargo_teu is not None:
        quotable.append(("daily_cargo_teu", float(metrics.daily_cargo_teu)))
    flight_metrics = sample_flight_metrics()
    if flight_metrics.on_time_percent is not None:
        quotable.append(("on_time_percent", flight_metrics.on_time_percent))

    def digits(value: float) -> str:
        """The digits a reader actually sees, with notation stripped.

        `:g` so a whole number is `1111` rather than `1111.0` — the trailing zero
        is an artefact of the float. `lstrip("0")` so `0.444` is `444` rather
        than `0444`: the leading zero before a decimal point is notation for the
        same reason, and a three-decimal rate is deliberate — §5.9 requires rates
        "rendered exactly as published … no rounding, no conversion", and
        `TON-GT` is the row that proves the formatter honours it.

        A genuine offender still fails: `0.42` becomes `42`.
        """
        return f"{value:g}".replace(".", "").replace("-", "").lstrip("0")

    offenders = [(label, value) for label, value in quotable if len(set(digits(value))) > 1]
    assert offenders == [], f"not repeated-digit: {offenders}"


def test_fixture_data_is_refused_in_production(tmp_settings, monkeypatch) -> None:
    """Refused at boot, like the wildcard origin — a guard that runs once."""
    tmp_settings.ENV = "prod"
    tmp_settings.OPS_DATA_SOURCE = "fixture"
    tmp_settings.ALLOWED_ORIGINS = "https://example.invalid"
    monkeypatch.setattr("app.main.get_settings", lambda: tmp_settings)

    with pytest.raises(ValueError, match="OPS_DATA_SOURCE"):
        create_app()


def test_production_boots_with_no_feed(tmp_settings, monkeypatch) -> None:
    """The safe setting is not merely allowed, it is the one that works."""
    tmp_settings.ENV = "prod"
    tmp_settings.OPS_DATA_SOURCE = "none"
    tmp_settings.ALLOWED_ORIGINS = "https://example.invalid"
    monkeypatch.setattr("app.main.get_settings", lambda: tmp_settings)

    assert create_app() is not None


# ---------------------------------------------------------------- filtering


def test_vessel_search_matches_name_and_imo() -> None:
    rows = FixtureOpsSource().vessels()
    assert len(filter_vessels(rows, query="voyager")) == 1
    assert len(filter_vessels(rows, query="0000003")) == 1
    assert filter_vessels(rows, query="nothing here") == []


def test_vessel_filters_combine() -> None:
    """Two filters narrow, and the narrowing is a real intersection.

    Counts come from the fixture rather than being restated here as literals
    where it can be avoided: the point is that combining filters is stricter
    than either alone, not that the sample feed holds a particular number.
    """
    rows = FixtureOpsSource().vessels()
    cruise = filter_vessels(rows, vessel_type="Cruise")
    alongside = filter_vessels(rows, status="at_berth")
    both = filter_vessels(rows, vessel_type="Cruise", status="at_berth")

    assert cruise and alongside, "the fixture should exercise both filters"
    assert len(both) < min(len(cruise), len(alongside))
    assert all(v.vessel_type == "Cruise" and v.status == "at_berth" for v in both)


def test_flight_search_matches_number_and_port() -> None:
    rows = FixtureOpsSource().flights()
    # An exact flight number matches exactly one movement.
    assert len(filter_flights(rows, query="QQ 2222")) == 1
    # A port name matches every movement on that route, in both directions.
    sampleton = filter_flights(rows, query="sampleton")
    assert len(sampleton) > 1
    assert {f.direction for f in sampleton} == {"arrival", "departure"}
    # And direction narrows to one side of the board.
    departures = filter_flights(rows, direction="departure")
    assert departures and all(f.direction == "departure" for f in departures)
    assert len(departures) < len(rows)


def test_tariff_category_chips_survive_filtering(fixture_api: TestClient) -> None:
    """Chips come from the whole table.

    Derived from the filtered slice, selecting a category would remove every
    other chip and leave no way back.
    """
    body = fixture_api.get("/api/tariffs", params={"category": "cargo"}).json()
    assert {row["category"] for row in body["tariffs"]} == {"cargo"}
    assert set(body["categories"]) >= {"vessel_dues", "cargo", "aviation", "passenger"}


def test_tariff_search_matches_code_and_service() -> None:
    rows = sample_tariffs()
    assert len(filter_tariffs(rows, query="STO-D")) >= 1
    assert all("STO-D" in r.code for r in filter_tariffs(rows, query="STO-D"))
    assert {r.code for r in filter_tariffs(rows, query="storage")} >= {"STO-D", "STO-BB"}


# ── Facility scoping — T-06 (the field), T-09 (the values) ───────────────────
#
# The field landed in M2 before any fixture carried a value, so that generation
# would happen once against the final shape. M4a populated it. The assertions
# are still about the *mechanism* rather than about particular counts.


def test_a_vessel_carries_its_facility_and_does_not_guess_one() -> None:
    """Attributed where the feed says so, null where it does not.

    Both halves matter. A fixture in which every row is attributed would never
    exercise the unattributed rendering, and a reader would never see what the
    table does with a movement the feed declined to place.
    """
    rows = sample_vessels()
    attributed = [v for v in rows if v.facility is not None]
    unattributed = [v for v in rows if v.facility is None]

    assert attributed, "the feed should place most movements"
    assert unattributed, "and at least one it cannot — that is a real state"
    # Three of the four facilities appear; RLB has no vessel movements.
    assert {v.facility for v in attributed} == {
        "deep_water_harbour",
        "port_zante",
        "basseterre_ferry_terminal",
    }
    # And it is never inferred from the berth: the unattributed row has no berth
    # to infer from either.
    assert all(v.berth == "" for v in unattributed)


def test_filtering_by_facility_excludes_the_unattributed() -> None:
    """Asking for Port Zante must not return movements that might be anywhere."""
    rows = sample_vessels()

    zante = filter_vessels(rows, facility="port_zante")
    assert zante, "the fixture places cruise calls at Port Zante"
    assert all(v.facility == "port_zante" for v in zante)

    # The unattributed movement is in the feed and in no facility's result.
    # Compared by id: `VesselArrival` is a plain model and is not hashable.
    unplaced = {v.id for v in rows if v.facility is None}
    assert unplaced
    for facility in ("port_zante", "deep_water_harbour", "basseterre_ferry_terminal"):
        returned = {v.id for v in filter_vessels(rows, facility=facility)}
        assert not (unplaced & returned), facility

    # No filter, no exclusion.
    assert len(filter_vessels(rows)) == len(rows)


def test_the_facility_filter_works_on_flights_too() -> None:
    """The asymmetry that shipped in T-06, and the way it hid.

    `facility` reached `VesselArrival`, `GateAssignment` and `TariffRow` but not
    `Flight`. FastAPI **ignores an undeclared query parameter**, so
    `/api/flights?facility=port_zante` answered `200` with every flight in the
    feed while the same parameter filtered vessels correctly. Nothing failed;
    the board was simply unfiltered and looked filtered.

    "Show me the airport" is the same move as "show me Port Zante", and a screen
    showing both would have disagreed with itself.
    """
    rows = sample_flights()
    assert all(f.facility == "rlb_airport" for f in rows), "every movement is at RLB today"

    assert len(filter_flights(rows, facility="rlb_airport")) == len(rows)
    # And a facility with no flights is empty rather than everything.
    assert filter_flights(rows, facility="port_zante") == []
    assert filter_flights(rows, facility="deep_water_harbour") == []


def test_the_flights_endpoint_honours_the_facility_parameter(fixture_api: TestClient) -> None:
    """End to end, because the gap was in the router signature rather than the data."""
    everything = fixture_api.get("/api/flights").json()["total"]
    airport = fixture_api.get("/api/flights", params={"facility": "rlb_airport"}).json()
    elsewhere = fixture_api.get("/api/flights", params={"facility": "port_zante"}).json()

    assert airport["total"] == everything
    # The one that used to return the whole feed.
    assert elsewhere["total"] == 0
    assert elsewhere["flights"] == []


def test_a_facility_tariff_filter_keeps_the_port_wide_rates() -> None:
    """A charge published for the whole port applies at the facility asked about.

    Dropping it would understate what a caller owes, which is the one direction
    a tariff filter must never be wrong in.
    """
    rows = sample_tariffs()
    port_wide = [r for r in rows if r.facility is None]
    assert port_wide, "the fixture schedule is port-wide until M4 attributes it"

    specific = rows[0].model_copy(update={"facility": "rlb_airport"})
    mixed = [specific, *rows[1:]]

    at_airport = filter_tariffs(mixed, facility="rlb_airport")
    assert specific in at_airport
    assert all(r.facility in ("rlb_airport", None) for r in at_airport)

    elsewhere = filter_tariffs(mixed, facility="port_zante")
    assert specific not in elsewhere


def test_the_facility_filter_reaches_the_endpoint(fixture_api: TestClient) -> None:
    """`total` is counted after filtering, so pagination cannot disagree."""
    everything = fixture_api.get("/api/vessels").json()
    zante = fixture_api.get("/api/vessels", params={"facility": "port_zante"}).json()

    assert zante["total"] < everything["total"], "the parameter did the work"
    assert zante["total"] == len(zante["vessels"]), "total counts matches, not the page"
    assert {v["facility"] for v in zante["vessels"]} == {"port_zante"}

    # A facility with no vessel movements is empty rather than an error.
    airport = fixture_api.get("/api/vessels", params={"facility": "rlb_airport"}).json()
    assert airport["vessels"] == []
    assert airport["total"] == 0


def test_the_metric_tiles_the_design_draws_carry_figures() -> None:
    """T-07 put the fields on the wire; T-09 and T-10 filled them.

    The calendar day and the rolling window are **different numbers**, which is
    the whole reason the field was added: the tile says "today" and was reading
    a window that reaches into tomorrow morning.
    """
    metrics = sample_vessel_metrics()
    assert metrics.arrivals_today is not None
    assert metrics.arrivals_next_24h is not None
    assert metrics.arrivals_today != metrics.arrivals_next_24h

    flights = sample_flight_metrics()
    for field in ("arrivals_today", "departures_today", "delayed"):
        assert getattr(flights, field) is not None, field

    # And none of §5.3's three is `total_flights` wearing a different label:
    # that counts both directions across the whole feed.
    assert flights.arrivals_today != flights.total_flights
    assert flights.arrivals_today + flights.departures_today == flights.total_flights


def test_the_status_chips_that_had_never_rendered_now_do() -> None:
    """`08-blocked-and-forbidden.md` #6 — "a chip that has never been rendered
    is a chip nobody has checked".

    Three enum values were built at full fidelity and produced by no fixture.
    All three are in the feed now, which is what makes them checkable at all.
    """
    statuses = {v.status for v in sample_vessels()}
    assert "departed" in statuses, "settled and closed — takes no status hue"
    assert "unknown" in statuses, "hollow dot, dashed outline, em dash"
    # And the set is complete, so the greyscale proof has every variant to show.
    assert statuses == {"at_berth", "en_route", "scheduled", "departed", "unknown"}

    flight_statuses = {f.status for f in sample_flights()}
    assert "arrived" in flight_statuses, "differs from `landed` by glyph and label"
    assert "landed" in flight_statuses, "and both must be present to tell them apart"
    assert flight_statuses == {
        "on_time",
        "delayed",
        "landed",
        "arrived",
        "boarding",
        "cancelled",
    }


def test_the_fixture_clock_does_not_give_every_row_the_same_minute() -> None:
    """0032's times clause, and the reason `_at` takes a minute.

    Deriving every timestamp from `now()` and zeroing the seconds gave the whole
    board one minute — `14:37`, `16:37`, `22:37` — which is a tell of its own
    and a sillier one than repeated digits.
    """
    minutes = {
        stamp.minute
        for vessel in sample_vessels()
        for stamp in (vessel.eta, vessel.ata)
        if stamp is not None
    }
    minutes |= {f.scheduled_time.minute for f in sample_flights() if f.scheduled_time}

    assert len(minutes) > 3, f"the board shares too few minutes: {sorted(minutes)}"


def test_paging_reports_the_full_match_count(fixture_api: TestClient) -> None:
    """`total` is matches, not the page — or pagination cannot be rendered."""
    everything = fixture_api.get("/api/vessels").json()["total"]
    body = fixture_api.get("/api/vessels", params={"limit": 1}).json()

    assert len(body["vessels"]) == 1, "the page is one row"
    assert body["total"] == everything, "the total is every match, not the page"
    assert everything > 1, "a feed of one cannot demonstrate the difference"


# --------------------------------------------------------------- the quote


def test_a_quote_prices_only_published_rates(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "40ft", "units": 2, "storage_days": 5},
    ).json()

    published = {row.code: row.amount for row in sample_tariffs()}
    for line in body["line_items"]:
        assert line["rate"] == published[line["code"]], "a rate was not the published one"


def test_a_quote_reports_the_charges_it_could_not_price(fixture_api: TestClient) -> None:
    """A dropped charge must be visible in the response, not only in a log line.

    `build_quote` has always known which applicable codes had no published rate.
    It returned them, the router logged the count, and the field never reached
    the client — so a quote missing a whole charge arrived byte-for-byte as tidy
    as a complete one, and the reader had no way to tell. That is the worst
    outcome this endpoint can produce, and `unpriced` is the only thing in the
    payload that reveals it.
    """
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "40ft", "units": 2, "storage_days": 5},
    ).json()

    assert "unpriced" in body, "the client cannot detect a short total without this field"
    assert isinstance(body["unpriced"], list)
    # Every code named here is absent from the lines, which is precisely why it
    # has to be named: nothing else in the payload accounts for it.
    priced = {line["code"] for line in body["line_items"]}
    assert priced.isdisjoint(body["unpriced"])


def test_the_printed_lines_add_up_to_the_printed_total(fixture_api: TestClient) -> None:
    """A reader who checks the arithmetic must not find it off by a cent.

    This is why each line is rounded before summing rather than the total being
    computed from raw rates.
    """
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "20ft", "units": 3, "storage_days": 7},
    ).json()

    assert round(sum(line["amount"] for line in body["line_items"]), 2) == body["subtotal"]
    assert body["subtotal"] == body["total"]


def test_a_total_always_carries_its_warning(fixture_api: TestClient) -> None:
    """The one thing that must never be droppable."""
    body = fixture_api.post("/api/tariffs/quote", json={"category": "vessel_dues"}).json()

    assert body["derived"] is True
    disclaimer = body["disclaimer"]
    assert "Estimate only" in disclaimer
    assert "not an official customs assessment" in disclaimer
    assert "869-465-8121" in disclaimer


def test_a_missing_rate_is_reported_not_guessed() -> None:
    """A total quietly missing its largest component is worse than no total."""

    class NoTariffs(FixtureOpsSource):
        def tariffs(self):  # noqa: ANN201
            return []

    lines, unpriced = build_quote(
        TariffQuoteRequest(category="cargo", units=2, container_size="20ft"), NoTariffs()
    )

    assert lines == []
    # The code the calculator *expected* and could not find. It moves with the
    # table — CU-1 — and hardcoding the old `SMP-010` here would have kept
    # passing against a schedule that no longer contains it.
    assert WHARFAGE_20FT_CODE in unpriced
    assert total_of(lines) == 0.0


def test_a_cargo_quote_prices_every_line(fixture_api: TestClient) -> None:
    """CU-1's exit gate, and the reason the table and the constants are one unit.

    A code renamed on one side and not the other does not raise, does not fail a
    type check, and does not fail a test that only asserts the quote is
    well-formed. It produces an EMPTY, CLEAN-LOOKING quote: every line into
    `unpriced`, subtotal `0.00`, and §5.11's "Nothing to charge for those
    figures" rendered as though the inputs were simply unpriceable.

    So this asserts the opposite of well-formed — that there is something there.
    """
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "40ft", "units": 12, "storage_days": 3},
    ).json()

    assert len(body["line_items"]) >= 3, body["line_items"]
    assert body["subtotal"] > 0
    assert body["unpriced"] == [], "every applicable code resolved to a published rate"
    # The lines add up to the total the reader is shown — `tariffs.py` rounds per
    # line for exactly this.
    assert round(sum(line["amount"] for line in body["line_items"]), 2) == body["subtotal"]
    assert body["total"] == body["subtotal"]


def test_a_unit_symbol_takes_no_plural(fixture_api: TestClient) -> None:
    """`220 ft`, never `220 fts` — found by looking at the screen in the T-23 rehearsal.

    A unit symbol abbreviates the unit; it is not a count of things, so it takes
    no plural. Nobody writes `5 kgs` on an invoice. `container` and `day` ARE
    counts and do pluralise, which is what `_plural` is for — so this asserts
    both halves, or the fix would be to stop pluralising anything.

    It reached a demonstration screen because `quantity_label` had no test at
    all: it is a display string, so nothing that checked arithmetic could see it.
    """
    maritime = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "vessel_dues", "vessel_type": "cruise", "length_ft": 220, "stay_days": 2},
    ).json()
    labels = " | ".join(line["quantity_label"] for line in maritime["line_items"])
    # Guard the guard: without a dockage line there is no `ft` label to check,
    # and the assertion below would pass on an empty string.
    assert any("ft" in line["quantity_label"] for line in maritime["line_items"]), maritime
    assert "fts" not in labels, labels
    assert "220 ft" in labels, labels

    cargo = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "40ft", "units": 12, "storage_days": 3},
    ).json()
    cargo_labels = " | ".join(line["quantity_label"] for line in cargo["line_items"])
    # A word that is a count still pluralises, and the singular still reads right.
    assert "12 containers" in cargo_labels, cargo_labels
    assert "3 days" in cargo_labels, cargo_labels

    one = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "20ft", "units": 1, "storage_days": 1},
    ).json()
    one_labels = " | ".join(line["quantity_label"] for line in one["line_items"])
    assert "1 container" in one_labels and "1 containers" not in one_labels, one_labels


def test_vessel_type_selects_the_published_dockage_rate(fixture_api: TestClient) -> None:
    """§5.10's select was inert because nothing read this field. Now it does.

    The schedule publishes two dockage rates that differ only by vessel type, so
    the figure genuinely changes — which is what makes an enabled control
    honest. A select that moved no number would be the product implying a rule
    it does not apply.
    """

    def dockage(vessel_type: str | None) -> dict:
        body = {"category": "vessel_dues", "length_ft": 100, "stay_days": 2}
        if vessel_type is not None:
            body["vessel_type"] = vessel_type
        lines = fixture_api.post("/api/tariffs/quote", json=body).json()["line_items"]
        return next(line for line in lines if line["code"].startswith("DCK"))

    commercial = dockage("commercial")
    cruise = dockage("cruise")

    assert commercial["code"] == DOCKAGE_CODE
    assert cruise["code"] == DOCKAGE_CRUISE_CODE
    assert cruise["rate"] > commercial["rate"], "the two published rates differ"
    assert cruise["amount"] > commercial["amount"], "and the total moves with them"

    # Absent or unrecognised prices as commercial — the schedule's own rate for a
    # vessel it does not single out, rather than a guess or a refusal.
    assert dockage(None)["code"] == DOCKAGE_CODE
    assert dockage("submarine")["code"] == DOCKAGE_CODE


def test_the_offered_vessel_types_are_the_ones_the_schedule_prices() -> None:
    """The list is read off the table, never chosen by a component.

    Inventing four vessel types would be inventing SCASPA's tariff structure —
    which is why the select was disabled rather than filled with plausible
    options. Every type offered must map to a code the schedule publishes.
    """
    published = {row.code for row in sample_tariffs()}
    for vessel_type in VESSEL_TYPES:
        assert DOCKAGE_BY_VESSEL_TYPE[vessel_type] in published, vessel_type


def test_the_calculator_codes_all_exist_in_the_published_table() -> None:
    """The pairing itself, asserted directly rather than through a quote.

    Every constant `build_quote` can look up must be a code the schedule
    actually publishes. This is the check that would have caught a half-applied
    CU-1 immediately, rather than at the moment someone read a zero total.
    """
    published = {row.code for row in sample_tariffs()}
    expected = {
        DOCKAGE_CODE,
        PILOTAGE_CODE,
        HARBOUR_DUES_CODE,
        WHARFAGE_20FT_CODE,
        WHARFAGE_40FT_CODE,
        HANDLING_CODE,
        STORAGE_CODE,
    }

    assert expected <= published, f"calculator codes missing from the table: {expected - published}"


def test_currency_conversion_is_refused(fixture_api: TestClient) -> None:
    """Prompt rule 4 forbids converting a published fee. So does the calculator.

    A converted total would apply an exchange rate nobody published, with more
    authority than a sentence carries.
    """
    response = fixture_api.post(
        "/api/tariffs/quote", json={"category": "cargo", "units": 1, "currency": "USD"}
    )
    assert response.status_code == 422


def test_an_empty_request_produces_no_invented_lines(fixture_api: TestClient) -> None:
    """Nothing entered, nothing charged for — except the per-call vessel dues."""
    body = fixture_api.post("/api/tariffs/quote", json={"category": "cargo"}).json()
    assert body["line_items"] == []
    assert body["total"] == 0.0
    # Still warns. A zero is a figure too.
    assert body["disclaimer"]


# --------------------------------------------------------------- support


def test_a_ticket_returns_a_reference_and_a_next_step(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "Query about container storage",
            "details": "Placeholder details for a fixture test.",
        },
    ).json()

    assert body["reference"].startswith("SC-")
    # Nobody will contact them, and the response has to say so.
    assert "Quote reference" in body["next_step"]
    assert "869-465-8121" in body["next_step"]


def test_the_ticket_endpoint_accepts_no_personal_details(fixture_api: TestClient) -> None:
    """The design collected a name, an email and a phone number. None are taken.

    Pydantic is configured to ignore unknown keys rather than reject them, so
    this asserts the important half: whatever a client sends, none of it comes
    back and none of it is a field. `docs/privacy.md` stays true.
    """
    response = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "Test",
            "details": "Test details.",
            "full_name": "A Person",
            "email": "person@example.invalid",
            "phone": "555-0100",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert set(body) == {
        "reference",
        "department",
        "expected_response",
        "next_step",
        "transcript_included",
        "request_id",
    }
    serialised = str(body)
    assert "A Person" not in serialised
    assert "person@example.invalid" not in serialised
    assert "555-0100" not in serialised


def test_a_transcript_is_only_attached_when_asked_for(fixture_api: TestClient) -> None:
    """Defaulting this on would forward someone's questions to a mailbox."""
    body = fixture_api.post(
        "/api/support/ticket",
        json={"department": "Port operations", "subject": "S", "details": "D"},
    ).json()
    assert body["transcript_included"] is False


def test_a_transcript_cannot_be_attached_without_a_conversation(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "S",
            "details": "D",
            "include_transcript": True,
            "conversation_id": "00000000-0000-4000-8000-000000000000",
        },
    ).json()
    # No such conversation in this process, so nothing to attach — and it says so
    # rather than claiming it attached something.
    assert body["transcript_included"] is False


def test_a_blank_ticket_is_rejected(fixture_api: TestClient) -> None:
    response = fixture_api.post(
        "/api/support/ticket",
        json={"department": "Port operations", "subject": "   ", "details": "D"},
    )
    assert response.status_code == 422


def test_the_directory_publishes_the_real_contact_route(fixture_api: TestClient) -> None:
    """The phone number is real and repeating it is not inventing it."""
    body = fixture_api.get("/api/support/directory").json()
    serialised = str(body)

    assert "869-465-8121" in serialised
    assert body["departments"], "the ticket form needs its department options"
    assert body["emergency"], "the banner text must be present"


def test_the_directory_invents_no_extensions(fixture_api: TestClient) -> None:
    """The mockup's "Ext. 9110" for a security gate appears in no verified source.

    A wrong extension for a security gate is a worse failure than no extension.
    """
    serialised = str(fixture_api.get("/api/support/directory").json())
    for invented in ("9110", "2240", "4450", "3315", "1102", "4481"):
        assert invented not in serialised


def test_support_stays_up_when_no_feed_is_configured(empty_api: TestClient) -> None:
    """Support must never be the thing that goes dark.

    It is what someone reaches for when everything else has told them to call.
    """
    body = empty_api.get("/api/support/directory").json()
    assert "869-465-8121" in str(body)
    assert body["locations"]


# ---------------------------------------------------------------- rate limits


def test_reading_a_board_does_not_spend_the_budget_for_asking_a_question() -> None:
    """Browsing an arrivals board is naturally several requests.

    A search, a filter, a refresh — and if those came out of the chat budget then
    paging through vessel arrivals would leave a traveller unable to ask a
    question, having spent their allowance on page views they never thought of as
    requests. Reading a feed costs a dictionary lookup; a chat turn costs a model
    call. The budgets are separate and sized accordingly.
    """
    from app.ratelimit import RateLimiter

    limiter = RateLimiter()
    chat_limit = limiter.limit_for("chat")

    assert limiter.limit_for("ops") > chat_limit, "reading must be cheaper than asking"
    assert limiter.limit_for("voice") < chat_limit, "voice must stay stricter than chat"

    # And the scopes are independent: exhausting one leaves the other untouched.
    for _ in range(chat_limit):
        assert limiter.check("198.51.100.7", scope="chat").allowed
    assert not limiter.check("198.51.100.7", scope="chat").allowed
    assert limiter.check("198.51.100.7", scope="ops").allowed


# ─────────────────────────────────────────────────────────── assistant cards
#
# The safety property is one sentence: the model names a kind, and nothing it
# writes reaches the rows. Everything below is a way of checking that.


def test_the_card_tool_exposes_no_parameter_that_could_carry_data() -> None:
    """The strongest guarantee available: it is not expressible.

    A vessel name, an ETA, a berth, a status, a rate or a total cannot be passed
    to `show_card` because there is no argument for one. This is checked against
    the tool's actual signature rather than its docstring, because a docstring
    promising it would not stop a future parameter from arriving.
    """
    from app.agent.tools import show_card

    accepted = set(show_card.args.keys())
    assert accepted == {"card", "direction", "department", "subject"}

    forbidden = {
        "vessel",
        "vessels",
        "name",
        "imo",
        "eta",
        "ata",
        "berth",
        "status",
        "flight",
        "gate",
        "rate",
        "amount",
        "total",
        "rows",
        "data",
    }
    assert accepted & forbidden == set()


def test_a_vessel_card_is_populated_from_the_feed(fixture_api: TestClient) -> None:
    from app.ops.cards import build_card
    from app.ops.source import FixtureOpsSource
    from app.schemas import CardRequest

    source = FixtureOpsSource()
    card = build_card(CardRequest(kind="vessel_arrivals"), source)

    feed = {vessel.name for vessel in source.vessels()}
    assert {vessel.name for vessel in card.vessels} <= feed, "a row appeared from nowhere"
    assert card.source.kind == "fixture"
    assert card.source.notice, "a card must carry its feed's provenance wherever it is shown"


def test_a_card_from_an_empty_feed_still_renders_rather_than_vanishing(tmp_settings) -> None:
    """An answer saying "here is the board" with no board is worse than an empty one.

    The empty card carries the unavailable notice, which is the explanation.
    """
    from app.ops.cards import build_card
    from app.ops.source import UnavailableOpsSource
    from app.schemas import CardRequest

    card = build_card(CardRequest(kind="vessel_arrivals"), UnavailableOpsSource())

    assert card.vessels == []
    assert card.total == 0
    assert "not connected" in (card.source.notice or "")


def test_the_calculator_card_carries_no_figures() -> None:
    """A pre-totalled card would be the model producing an estimate — rule 4."""
    from app.ops.cards import build_card
    from app.ops.source import FixtureOpsSource
    from app.schemas import CardRequest

    card = build_card(CardRequest(kind="tariff_calculator"), FixtureOpsSource())
    serialised = card.model_dump()

    for key, value in serialised.items():
        assert not isinstance(value, (int, float)) or isinstance(value, bool), (
            f"{key} is a number on a card that must contain none"
        )


def test_a_ticket_subject_is_capped_not_trusted() -> None:
    """It is the one string the model supplies, so it is bounded."""
    from app.ops.cards import build_card
    from app.ops.source import FixtureOpsSource
    from app.schemas import CardRequest

    card = build_card(CardRequest(kind="support_ticket", subject="x" * 500), FixtureOpsSource())
    assert len(card.subject) == 200


def test_an_unknown_card_kind_is_refused_with_a_usable_message() -> None:
    from app.agent.tools import show_card, turn_context

    with turn_context() as context:
        reply = show_card.invoke({"card": "live_map"})
        assert "Rejected" in reply
        assert "vessel_arrivals" in reply, "the model needs to know what it may ask for"
        assert context.card is None


def test_a_valid_card_is_recorded_on_the_turn_not_returned_as_text() -> None:
    """Same as make_chart: held on the turn so the model cannot edit it after."""
    from app.agent.tools import show_card, turn_context

    with turn_context() as context:
        reply = show_card.invoke({"card": "vessel_arrivals"})
        assert context.card is not None
        assert context.card.kind == "vessel_arrivals"
        # And the model is told not to narrate it.
        assert "Do not describe its contents" in reply


# ── The panels that used to have no feed ─────────────────────────────────────
#
# Positions, gates and marine advisories. The safety-critical claims are the
# same as everywhere else on this surface — a fixture announces itself, an empty
# feed is not an error, and nothing invented can reach production — plus one
# that is specific to these: a marine advisory is the only fake datum in this
# codebase a reader could act on at sea.


def test_the_new_panels_are_empty_and_fine_with_no_feed(empty_api: TestClient) -> None:
    for path, key in [
        ("/api/ops/positions", "positions"),
        ("/api/ops/gates", "gates"),
        ("/api/ops/advisories", "advisories"),
    ]:
        response = empty_api.get(path)
        assert response.status_code == 200, path
        body = response.json()
        assert body[key] == []
        assert body["total"] == 0
        # Absence is stated, not implied by an empty list.
        assert body["source"]["kind"] == "unavailable"
        assert body["source"]["notice"]


def test_the_new_panels_announce_sample_data(fixture_api: TestClient) -> None:
    for path in ["/api/ops/positions", "/api/ops/gates", "/api/ops/advisories"]:
        body = fixture_api.get(path).json()
        assert body["source"]["kind"] == "fixture", path
        assert "SAMPLE DATA" in body["source"]["notice"], path


def test_a_position_says_who_reported_it(fixture_api: TestClient) -> None:
    positions = fixture_api.get("/api/ops/positions").json()["positions"]
    assert positions
    # A transponder, a harbour master and an estimate are different claims, and
    # a map that renders them identically invites the reader to conflate them.
    assert {p["reported_by"] for p in positions} <= {"ais", "manual", "estimated"}
    assert any(p["reported_by"] == "manual" for p in positions)
    # Not reported is null, never 0.0 — "stationary" is a different statement.
    assert any(p["speed_knots"] is None for p in positions)


def test_positions_line_up_with_the_vessels_they_name(fixture_api: TestClient) -> None:
    # The map and the table beside it must be talking about the same ships.
    vessel_ids = {v["id"] for v in fixture_api.get("/api/vessels").json()["vessels"]}
    for position in fixture_api.get("/api/ops/positions").json()["positions"]:
        assert position["id"] in vessel_ids, position["id"]


def test_gate_counts_are_computed_from_the_gates_themselves(fixture_api: TestClient) -> None:
    body = fixture_api.get("/api/ops/gates").json()
    expected = sum(1 for g in body["gates"] if g["status"] in ("occupied", "boarding"))
    assert body["active"] == expected
    assert body["total"] == len(body["gates"])
    # A free or closed stand is not active. Asserted rather than assumed,
    # because "active" is exactly the word two screens disagree about.
    assert body["active"] < body["total"]


def test_a_sample_marine_advisory_cannot_be_mistaken_for_a_real_one() -> None:
    """The one fake datum in this repo somebody could act on at sea.

    A fabricated swell warning naming a real port is not the same class of fake
    as a fabricated berth number: it can be believed and acted on, and a quiet
    screen can be read as an all-clear. So every string is checked, not just the
    notice above it.
    """
    from app.ops.fixtures import sample_marine_advisories

    for advisory in sample_marine_advisories():
        assert "sample" in advisory.headline.lower()
        assert "Placeholder" in advisory.port
        # No real SCASPA facility is named anywhere in the record.
        blob = f"{advisory.port} {advisory.headline} {advisory.detail}".lower()
        for real in ["basseterre", "port zante", "charlestown", "deep water", "bradshaw"]:
            assert real not in blob, f"{real} appears in a fabricated marine advisory"
        # Never the severity that would make somebody change a plan.
        assert advisory.severity == "low"


def test_the_operator_profile_is_absent_without_fixtures(empty_api: TestClient) -> None:
    body = empty_api.get("/api/ops/profile").json()
    assert body["profile"] is None


def test_the_operator_profile_says_it_is_a_demo(fixture_api: TestClient) -> None:
    profile = fixture_api.get("/api/ops/profile").json()["profile"]
    assert profile is not None
    # Not a bool. A field that could be False is one somebody sets to False.
    assert profile["is_demo"] is True
    assert "DEMO" in profile["notice"]
    assert "no sign-in" in profile["notice"]
    # The design's name and credential are not reproduced — a plausible officer
    # and a plausible badge number are what get screenshotted and circulated.
    blob = f"{profile['display_name']} {profile['agent_id']} {profile['jurisdiction']}"
    assert "Alistair" not in blob
    assert "SKN-PORT" not in blob
    assert "Sample" in profile["display_name"]


def test_the_profile_endpoint_reads_nothing_about_the_caller(fixture_api: TestClient) -> None:
    """It is not an authentication endpoint and must not become one.

    Same card for everyone, whatever they send. If this ever starts varying by
    header or cookie, this product has grown a session it is not allowed to have.
    """
    plain = fixture_api.get("/api/ops/profile").json()["profile"]
    with_headers = fixture_api.get(
        "/api/ops/profile",
        headers={"Authorization": "Bearer sample", "Cookie": "session=sample"},
    ).json()["profile"]
    assert plain == with_headers
