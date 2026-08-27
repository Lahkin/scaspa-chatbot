"""The allow-list. Watchtower fetches these and nothing else.

## Why an allow-list rather than a crawl

`app/scraper/site.py` already knows how to crawl scaspa.com politely, and
Watchtower deliberately does not use that ability. A monitor that discovered its
own URLs would, on the first day SCASPA added a page, start fetching something
nobody had reviewed, parsing it with a parser chosen by guesswork, and writing
the result into the store that answers customer questions.

So the set of things this service will fetch is a literal tuple in source
control. Adding one is a code change with a review, which is the correct amount
of ceremony for "a new thing the assistant will now state as fact".

## Cadence is per source, because the sources are not alike

A cruise schedule that moves is an inconvenience; a tariff that moves is money.
`requires_approval` marks the sources whose parsed changes must never reach
readers without a human agreeing to them.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from app.schemas import CruiseCall
from app.watchtower.parsers import parse_cruise_api


@dataclass(frozen=True)
class Source:
    """One approved source, and everything the monitor needs to handle it."""

    id: str
    url: str
    label: str
    """How this is described to a reader. Rendered as-is, so it says SCASPA."""

    parser: Callable[[str], list[CruiseCall]]
    interval_hours: int
    page_url: str | None = None
    """The human page this data appears on, for citing to a reader.

    The fetch URL is an API endpoint; nobody should be sent to it. Every answer
    that quotes this source links here instead.
    """

    params: Mapping[str, str] = field(default_factory=dict)
    revision_params: Mapping[str, str] | None = None
    """A cheap request that changes only when the data does.

    When a source offers one, the monitor asks it first and skips the expensive
    fetch entirely if the answer is unchanged. Absent, the monitor falls back to
    hashing the full payload.
    """
    requires_approval: bool = False
    """Parsed changes are staged for a human rather than activated.

    False for a schedule: a cruise call that moved has moved, and showing the
    old one helps nobody. True for anything financial — see the note above.
    """


SOURCES: tuple[Source, ...] = (
    Source(
        id="cruise_schedule",
        # ── SCASPA'S OWN STRUCTURED ENDPOINT, NOT THE HTML PAGE ─────────────
        #
        # `cruise-ship-schedule.html` serves the table's header and an EMPTY
        # tbody; every row is injected by a SCASPA-built widget calling this
        # Apps Script endpoint. Parsing the page would have returned zero rows
        # forever while appearing to work.
        #
        # This is the structured source the spec said to prefer, and it is the
        # Authority's own — the same URL every visitor's browser calls when the
        # page loads. Fetching it server-side asks for exactly what a reader's
        # browser already asks for, once every six hours instead of on every
        # page view.
        url=(
            "https://script.google.com/macros/s/"
            "AKfycbw78PBaP3icDxvIiR-9aat5b6wjrpMfvxSD_0805NypmrvL3wVNSrjVSmFRu0mctwYA/exec"
        ),
        page_url="https://www.scaspa.com/cruise-ship-schedule.html",
        label="Official SCASPA cruise schedule",
        parser=parse_cruise_api,
        # `?action=getRequests&year=YYYY`. The year is filled in at fetch time
        # rather than pinned here, so this entry does not expire on 1 January.
        params={"action": "getRequests"},
        # A version marker the endpoint publishes for exactly this purpose —
        # cheaper and more accurate than hashing 240 kB of JSON.
        revision_params={"action": "getRequestsRevision"},
        # Six hours. The schedule is edited by hand and a call moving inside a
        # working day is the case worth catching; anything faster is load on
        # someone else's server for no benefit to a reader.
        interval_hours=6,
    ),
    # ── CARGO IS DELIBERATELY ABSENT ────────────────────────────────────────
    #
    # `scaspa.com/cargo.html` is an approved source in principle and is not
    # listed, because on inspection it publishes no data to monitor. The page
    # carries an FAQ describing a "Cargo Info table" with a search field "at the
    # top right" — and the served document contains no table, no input elements,
    # no iframe and 1,332 characters of body text in total. The only XHR calls
    # are the site platform's own membership RPCs.
    #
    # Registering it would give Watchtower a source that hashes the same empty
    # page forever, and would put a cargo parser in the tree that has never seen
    # a cargo row. It goes in when SCASPA restores or exposes the table, and the
    # /cargo route says plainly in the meantime that published status is not
    # available. See docs/decisions.md 0039.
)


def by_id(source_id: str) -> Source:
    for source in SOURCES:
        if source.id == source_id:
            return source
    raise KeyError(f"{source_id} is not an approved source")
