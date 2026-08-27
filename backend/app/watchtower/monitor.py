"""Watchtower: the SCASPA source monitor.

Its job is **knowledge freshness**, not conversation. It fetches approved SCASPA
pages on a schedule, notices when they change, and keeps the structured store in
step. Nothing here talks to a model.

    fetch → normalise → hash → compare → (stop if unchanged)
          → parse → validate → timestamp → store → log

## The hash comes before the parse, and that ordering is the whole design

Parsing is the expensive, fragile step. Hashing first means the common case —
a page that has not changed since the last check — costs one request and a
comparison, and cannot possibly corrupt the store. On a hand-edited schedule
that is nearly every check.

## What gets hashed is not the response body

A Weebly page carries build timestamps, cache-busting query strings and a
rotating session token, so the raw bytes differ on every request and a raw hash
would report a change six times a day forever — which is the same as reporting
none, because nobody would read the log. `normalise()` reduces the document to
the part a reader would call the content.

## Failure keeps the last good data

A fetch that 500s, a page that has been restyled, a row that will not validate:
none of these empty the store. The previous schedule stays exactly where it is
and the failure is recorded. The alternative — clearing the table because a
request timed out — turns someone else's brief outage into this product
confidently telling a passenger that no ships are coming.
"""

import hashlib
import logging
import re
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from bs4 import BeautifulSoup

from app.config import Settings, get_settings
from app.scraper.site import REQUEST_TIMEOUT_SECONDS, assert_not_blocked
from app.watchtower import store
from app.watchtower.parsers import ParseError
from app.watchtower.registry import SOURCES, Source

logger = logging.getLogger(__name__)

_WHITESPACE = re.compile(r"\s+")

# Three attempts, 2s then 4s apart. Enough for the flake measured above;
# short enough that a genuinely dead endpoint is reported inside a minute.
FETCH_ATTEMPTS = 3
FETCH_BACKOFF_SECONDS = 2.0


@dataclass(frozen=True)
class CheckResult:
    """What one check did. Returned so a caller can log or report it."""

    source_id: str
    outcome: str
    """unchanged | updated | staged | fetch_failed | parse_failed | skipped"""

    rows: int | None = None
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.outcome in {"unchanged", "updated", "staged", "skipped"}


def normalise(html: str) -> str:
    """The part of a document a reader would call the content.

    Scripts, styles and the platform's own furniture are dropped, then
    whitespace is collapsed. What survives is the text — so a change here means
    SCASPA edited something, not that a CDN rebuilt an asset URL.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "link", "meta"]):
        tag.decompose()
    return _WHITESPACE.sub(" ", soup.get_text(" ", strip=True)).strip()


def content_hash(html: str) -> str:
    return hashlib.sha256(normalise(html).encode("utf-8")).hexdigest()


def _fetch(source: Source, params: Mapping[str, str], settings: Settings) -> str:
    """One request to an allow-listed source.

    ## The allow-list is the guard, not the hostname

    `app/scraper/site.py` scopes itself to scaspa.com, which is right for a
    crawler that follows links and could otherwise wander. This monitor follows
    nothing: it fetches exactly the URLs in `registry.SOURCES` and cannot be
    made to fetch another one, so the host does not have to be the guard.

    That matters because SCASPA publishes its cruise schedule through a Google
    Apps Script endpoint. It is the Authority's own data, on the Authority's own
    endpoint, and it is the same request every visitor's browser makes when the
    schedule page loads — we simply make it once every six hours instead of on
    every page view.

    The blocklist still applies, and always will: `assert_not_blocked` is
    checked before anything leaves the process, so `pay.scaspa.com` cannot be
    reached from here even if somebody added it to the registry by mistake.
    """
    assert_not_blocked(source.url, settings)

    query = {**source.params, **params}
    last: Exception | None = None
    with httpx.Client(
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": settings.SCRAPER_USER_AGENT},
    ) as client:
        for attempt in range(FETCH_ATTEMPTS):
            try:
                response = client.get(source.url, params=query)
                response.raise_for_status()
                return response.text
            except httpx.HTTPError as exc:
                # ── THIS ENDPOINT IS INTERMITTENTLY FLAKY ────────────────────
                #
                # Measured, not assumed: the same request with the same headers
                # returns 200, then 404, then times out, in a run of four. Apps
                # Script redirects to a one-time googleusercontent URL and that
                # hop is where it fails.
                #
                # Without a retry a single bad response leaves the schedule
                # stale for a full six-hour interval — so a transient failure
                # would look exactly like SCASPA publishing nothing. Three
                # attempts, backing off, and then it is a real failure and the
                # previous data stands.
                last = exc
                if attempt + 1 < FETCH_ATTEMPTS:
                    logger.info(
                        "watchtower_retry source=%s attempt=%d error=%s",
                        source.id,
                        attempt + 1,
                        exc,
                    )
                    time.sleep(FETCH_BACKOFF_SECONDS * (attempt + 1))
    raise last if last else RuntimeError("fetch failed with no exception")


def _due(source: Source, settings: Settings | None) -> bool:
    """Whether enough time has passed to be worth asking again."""
    state = store.source_state(source.id, settings)
    if not state or not state.get("last_checked_at"):
        return True
    last = datetime.fromisoformat(state["last_checked_at"])
    return datetime.now(UTC) - last >= timedelta(hours=source.interval_hours)


def check_source(
    source: Source,
    *,
    force: bool = False,
    settings: Settings | None = None,
) -> CheckResult:
    """One source, one pass of the pipeline."""
    settings = settings or get_settings()

    if not force and not _due(source, settings):
        return CheckResult(source.id, "skipped", detail="not due yet")

    # ── 1. the cheap question first ─────────────────────────────────────────
    #
    # When a source publishes a revision marker, ask that instead of pulling the
    # whole payload. SCASPA's endpoint offers one — it is a few hundred bytes
    # against a quarter of a megabyte, and it is the publisher's own statement
    # about whether anything moved rather than our inference from a checksum.
    marker: str | None = None
    if source.revision_params is not None:
        try:
            marker = _fetch(source, source.revision_params, settings)
        except httpx.HTTPError as exc:
            return _record_failure(source, "fetch_failed", exc, settings)

        digest = _digest(marker)
        if digest == store.previous_hash(source.id, settings):
            store.record_check(
                source.id,
                source.url,
                new_hash=digest,
                changed=False,
                outcome="unchanged",
                settings=settings,
            )
            logger.info("watchtower_unchanged source=%s via=revision", source.id)
            return CheckResult(source.id, "unchanged")

    # ── 2. the payload ──────────────────────────────────────────────────────
    #
    # The year is filled in here rather than pinned in the registry, so the
    # entry does not quietly expire at midnight on 31 December.
    year = str(datetime.now(UTC).year)
    try:
        payload = _fetch(source, {"year": year}, settings)
    except httpx.HTTPError as exc:
        return _record_failure(source, "fetch_failed", exc, settings)

    # With no revision marker, fall back to hashing what came back.
    digest = _digest(marker if marker is not None else payload)
    if marker is None and digest == store.previous_hash(source.id, settings):
        store.record_check(
            source.id,
            source.url,
            new_hash=digest,
            changed=False,
            outcome="unchanged",
            settings=settings,
        )
        return CheckResult(source.id, "unchanged")

    # ── 3. parse and validate ───────────────────────────────────────────────
    try:
        records = source.parser(payload)
    except ParseError as exc:
        # The source changed shape. Keep the last good data and be loud — this
        # is where it matters most, because the store is still answering
        # questions from the previous parse.
        logger.error("watchtower_parse_failed source=%s error=%s", source.id, exc)
        return _record_failure(source, "parse_failed", exc, settings, new_hash=digest)

    # ── 4. money waits for a human ──────────────────────────────────────────
    if source.requires_approval:
        store.record_check(
            source.id,
            source.url,
            new_hash=digest,
            changed=True,
            outcome="staged",
            rows_parsed=len(records),
            detail="awaiting human approval before activation",
            settings=settings,
        )
        logger.warning("watchtower_staged source=%s rows=%d", source.id, len(records))
        return CheckResult(source.id, "staged", rows=len(records))

    # ── 5. store and log ────────────────────────────────────────────────────
    written = store.replace_cruise_calls(
        records,
        source_id=source.id,
        source_url=source.page_url or source.url,
        content_hash=digest,
        settings=settings,
    )
    store.record_check(
        source.id,
        source.url,
        new_hash=digest,
        changed=True,
        # What is in the table, which is not `len(records)`: the store's key is
        # `(call_date, vessel)` and SCASPA's schedule contains genuine repeats.
        # Both numbers are logged because the gap between them is itself worth
        # seeing — it would grow if the publisher started duplicating rows.
        rows_parsed=written,
        detail=f"parsed={len(records)} stored={written}" if written != len(records) else None,
        settings=settings,
    )
    logger.info(
        "watchtower_updated source=%s parsed=%d stored=%d year=%s",
        source.id,
        len(records),
        written,
        year,
    )
    return CheckResult(source.id, "updated", rows=written)


def _digest(payload: str) -> str:
    """Hash of the payload, whitespace-normalised.

    Plain text rather than the HTML path: this is JSON now, and running it
    through an HTML parser to strip tags it does not have would only be a way to
    lose a brace.
    """
    return hashlib.sha256(_WHITESPACE.sub(" ", payload).strip().encode("utf-8")).hexdigest()


def _record_failure(
    source: Source,
    outcome: str,
    exc: Exception,
    settings: Settings,
    new_hash: str | None = None,
) -> CheckResult:
    """Write the failure down and leave the stored data exactly as it was."""
    logger.warning("watchtower_%s source=%s error=%s", outcome, source.id, exc)
    store.record_check(
        source.id,
        source.url,
        new_hash=new_hash,
        changed=False,
        outcome=outcome,
        detail=str(exc)[:400],
        settings=settings,
    )
    return CheckResult(source.id, outcome, detail=str(exc)[:200])


def check_all(*, force: bool = False, settings: Settings | None = None) -> list[CheckResult]:
    """Every approved source, in one pass."""
    settings = settings or get_settings()
    return [check_source(source, force=force, settings=settings) for source in SOURCES]
