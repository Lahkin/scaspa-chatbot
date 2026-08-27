"""Deterministic parsers for approved SCASPA sources.

**No LLM touches this path.** The Watchtower spec is explicit and the reason is
worth restating: a model asked to read a schedule will produce a plausible
schedule whether or not the source contained one. When the parse is wrong here
it raises, and the previous good data stays in place; when a model is wrong it
invents a sailing time and nothing anywhere says so.

## The cruise schedule is a JSON API, not an HTML table

The first version of this file parsed `cruise-ship-schedule.html`. That was
wrong, and finding out why is the most valuable thing this module records.

The served HTML contains the table's `<thead>` and an **empty `<tbody>`**. Every
row is injected by a SCASPA-built widget which calls a Google Apps Script
endpoint that the Authority publishes:

    ?action=getRequestYears        the years with data
    ?action=getRequests&year=YYYY  the records for one year
    ?action=getRequestsRevision    a version marker, per month

So SCASPA already has the structured endpoint the spec asked us to prefer over
scraping. Parsing the HTML would have returned zero rows forever while looking
like it worked — which is exactly how a monitor ends up quietly asserting that
no ships are coming.

## What is dropped, and why that is the important part

The endpoint returns considerably more than the public page displays:
`captainName`, `pilot`, `agentName`, `shipWorkers`, `requestId`, `sheetRow`,
`submittedAt`, `actualIn`, `actualOut`, `lastPortOfCall`, `nextPortOfCall`.

None of it is carried into `CruiseCall`. SCASPA's published table shows nine
columns and those nine are what this product may show. "The endpoint returned
it" is not the same as "the Authority published it", and the difference is
somebody's name.

## Whose filtering rules these are

Not ours. SCASPA's own widget excludes records where `visibility` is `hidden`
and where `status` is `pending` or `cancelled`, and this mirrors that exactly.
When the Authority marks a call hidden, it is hidden here too — deciding
otherwise would be this service overruling the publisher about its own data.
"""

import json
import logging
from datetime import date

from app.schemas import CruiseCall

logger = logging.getLogger(__name__)


class ParseError(RuntimeError):
    """The source did not contain what this parser was told to expect.

    Raised rather than returning an empty list, because the two mean opposite
    things: "SCASPA has published no calls" is data, and "the payload changed
    shape and we can no longer read it" is an incident. A parser that returned
    `[]` for both would silently empty the schedule the first time the endpoint
    was revised.
    """


# SCASPA's own rules, mirrored. Lower-cased at the point of comparison.
HIDDEN_VISIBILITY = {"hidden"}
EXCLUDED_STATUS = {"pending", "cancelled"}

# The nine columns the Authority publishes. Everything else the endpoint
# returns is deliberately not read.
PUBLISHED_FIELDS = (
    "date",
    "day",
    "time",
    "vesselName",
    "cruiseLine",
    "pier",
    "inaugural",
    "pax",
    "capacity",
)


def _int_or_none(raw: object) -> int | None:
    """A published integer, or nothing. Never a default."""
    text = str(raw or "").replace(",", "").strip()
    if not text.isdigit():
        return None
    return int(text)


def _iso_date(raw: object) -> date:
    """`YYYY-MM-DD`, which is what the endpoint returns.

    Pinned rather than passed to a permissive parser. The HTML table published
    `DD/MM/YYYY` and this endpoint publishes ISO; a parser that accepted both
    would one day meet `05/08/2026` and have to guess between the 5th of August
    and the 8th of May. A schedule silently shifted by three months is the worst
    failure available here, so an unexpected format fails loudly instead.
    """
    text = str(raw or "").strip()
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ParseError(f"cruise date is not ISO YYYY-MM-DD: {text!r}") from exc


def is_publishable(record: dict) -> bool:
    """Whether SCASPA has published this call for public display."""
    visibility = str(record.get("visibility") or "").strip().lower()
    status = str(record.get("status") or "").strip().lower()
    return visibility not in HIDDEN_VISIBILITY and status not in EXCLUDED_STATUS


def parse_cruise_api(payload: str) -> list[CruiseCall]:
    """The published cruise schedule, from `?action=getRequests&year=…`.

    Rows that cannot be read are SKIPPED and logged; a payload that is not a
    list of records raises. That asymmetry is deliberate — one malformed record
    among five hundred is a data-entry slip and the other four hundred and
    ninety-nine are still worth having, whereas a payload this parser cannot
    recognise means it no longer understands the source and must not report an
    empty schedule as though it were the truth.
    """
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ParseError(f"cruise endpoint did not return JSON: {exc}") from exc

    # The endpoint returns a bare list today. Accept the common wrappers too,
    # so a future `{"data": [...]}` is a shrug rather than an outage.
    records = data if isinstance(data, list) else (data.get("data") or data.get("requests"))
    if not isinstance(records, list):
        raise ParseError(f"cruise endpoint returned {type(data).__name__}, not a list of records")

    calls: list[CruiseCall] = []
    skipped = 0
    withheld = 0
    for record in records:
        if not isinstance(record, dict):
            skipped += 1
            continue
        if not is_publishable(record):
            withheld += 1
            continue
        try:
            calls.append(
                CruiseCall(
                    call_date=_iso_date(record.get("date")),
                    day=str(record.get("day") or "").strip(),
                    window=str(record.get("time") or "").strip(),
                    vessel=str(record.get("vesselName") or "").strip(),
                    cruise_line=str(record.get("cruiseLine") or "").strip(),
                    pier=str(record.get("pier") or "").strip(),
                    inaugural=str(record.get("inaugural") or "").strip().lower()
                    in {"yes", "y", "true", "1"},
                    # Published 0 means "not yet known", not "nobody aboard".
                    pax=_int_or_none(record.get("pax")) or None,
                    capacity=_int_or_none(record.get("capacity")),
                )
            )
        except (ParseError, ValueError) as exc:
            skipped += 1
            logger.warning("cruise_record_skipped error=%s", exc)

    logger.info(
        "cruise_parse parsed=%d withheld_by_scaspa=%d unreadable=%d",
        len(calls),
        withheld,
        skipped,
    )
    if calls or not records:
        return calls

    # Records arrived and none survived. Not an outage — SCASPA may have hidden
    # everything — but loud, because it is indistinguishable on screen from a
    # broken parser.
    logger.warning("cruise_parse produced no publishable calls from %d records", len(records))
    return calls
