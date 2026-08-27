"""The published cruise schedule, as a service.

One place that turns stored rows into an answer with its provenance attached.
Both callers use it — the HTTP endpoint that draws the Vessels page, and the
agent tool that answers "what arrives tomorrow" — so the two can never disagree
about what SCASPA published or when it was last checked.

That matters more than the deduplication: a screen and a sentence stating
different arrival times for the same ship is the failure this product is least
able to survive.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from app.config import Settings
from app.schemas import CruiseScheduleResponse, DataSource
from app.watchtower import store
from app.watchtower.registry import by_id

logger = logging.getLogger(__name__)

SOURCE_ID = "cruise_schedule"

# Where a reader is sent. The fetch URL is an API endpoint and nobody should be
# handed it; this is the page the Authority publishes for people.
PUBLIC_PAGE = "https://www.scaspa.com/cruise-ship-schedule.html"


def _describe(retrieved: datetime | None, settings: Settings | None = None) -> DataSource:
    """How this data must be labelled wherever it appears.

    `published`, never `live`. The schedule is fetched every six hours, and a
    six-hourly snapshot presented as live is the one claim that would make every
    other claim on the screen worth less. The timestamp is not decoration — the
    schema will not build a `published` source without it.

    When nothing has ever been fetched the source is `unavailable` rather than
    an empty `published` one, because "we have not looked" and "SCASPA has
    published nothing" are different statements and only one of them is about
    SCASPA.
    """
    if retrieved is None:
        return DataSource(
            kind="unavailable",
            label="Official SCASPA cruise schedule",
            as_of=None,
            notice=(
                "Pilot has not yet retrieved the published cruise schedule. "
                "Nothing is shown rather than something guessed."
            ),
        )
    return DataSource(
        kind="published",
        label="Official SCASPA cruise schedule",
        as_of=retrieved,
    )


def schedule(
    *,
    since: date | None = None,
    until: date | None = None,
    vessel: str | None = None,
    limit: int = 50,
    settings: Settings | None = None,
) -> CruiseScheduleResponse:
    """Published calls in a window, with the source that produced them."""
    calls, total, retrieved = store.read_cruise_calls(
        since=since, until=until, vessel=vessel, limit=limit, settings=settings
    )
    return CruiseScheduleResponse(source=_describe(retrieved, settings), calls=calls, total=total)


def today(settings: Settings | None = None) -> CruiseScheduleResponse:
    now = datetime.now(UTC).date()
    return schedule(since=now, until=now, settings=settings)


def upcoming(days: int = 7, settings: Settings | None = None) -> CruiseScheduleResponse:
    """The next `days` days, starting today.

    Used for the "what is coming" question and for the summary figures. Not a
    rolling 24-hour window: a passenger asking what is in port this week is
    asking about calendar days, and a window that quietly ends at 14:32 tomorrow
    answers a question nobody asked.
    """
    now = datetime.now(UTC).date()
    return schedule(since=now, until=now + timedelta(days=days), settings=settings)


def source_page() -> str:
    """The human page to cite. Never the API endpoint."""
    try:
        return by_id(SOURCE_ID).page_url or PUBLIC_PAGE
    except KeyError:  # pragma: no cover — the registry always has this source
        return PUBLIC_PAGE


def freshness(settings: Settings | None = None) -> dict:
    """What the console and the health endpoint show about this source.

    `last_checked_at` and `last_changed_at` are both here and they are not the
    same fact: "the schedule has not moved since Tuesday" and "nobody has looked
    since Tuesday" render identically on a screen and mean opposite things.
    """
    state = store.source_state(SOURCE_ID, settings) or {}
    return {
        "source_id": SOURCE_ID,
        "page_url": source_page(),
        "last_checked_at": state.get("last_checked_at"),
        "last_changed_at": state.get("last_changed_at"),
        "status": state.get("status", "never_checked"),
    }
