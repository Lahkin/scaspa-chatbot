"""Published SCASPA answers, served as a page rather than as a conversation.

## Why a second way out of the knowledge base

Everything in `data/knowledge/` already reaches users through the assistant,
with a citation and a verified date attached. That is the right shape for a
question somebody actually has. It is the wrong shape for a screen: a traveller
opening "Airport Information" does not yet know what to ask, and telling them to
go and think of a question is how a page ends up empty.

So this serves the same rows the assistant retrieves from, unchanged, straight
onto a page. Same source, same dates, same confidence rule.

## Nothing here is written by this service

That is the entire point, and it is `CLAUDE.md` rule 5 rather than a preference.
The alternative — a developer typing "the airport has a duty-free shop and two
lounges" into a component — produces text indistinguishable on screen from
something SCASPA stands behind, which nobody verified, which no researcher can
correct by editing the spreadsheet, and which drifts silently from the moment it
is written. The frontend has a whole module (`lib/scaspa-facts.ts`) devoted to
holding that line for the handful of facts it *is* allowed to hardcode.

Every question, every answer, every date below comes out of the researchers'
export and is rendered as published.

## `confirmed` only, the same as the index

Rule 8 says only `confidence == "confirmed"` rows are indexed for the live
assistant. A page is not a lower standard than a sentence — if anything it is a
higher one, because a screen is scanned and believed without the reader ever
asking a question they might have doubted the answer to. `probable` and
`unverified` rows are withheld here exactly as they are withheld there.
"""

import logging
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

from app.config import Settings, get_settings
from app.rag.loader import load_kb_csv, oldest_as_of
from app.rag.models import KBRow
from app.schemas import DataSource, GuideEntry, GuideResponse, GuideTopic

logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def _confirmed_rows(path: str, mtime: float) -> tuple[KBRow, ...]:
    """Every confirmed row in the export, parsed once.

    `mtime` is in the cache key and is otherwise unused: it is what makes a
    replaced CSV take effect without a restart, and what stops a stale parse
    outliving an export the researchers have just corrected. Passing the path
    alone would cache the first read forever.
    """
    rows, rejected = load_kb_csv(path)
    if rejected:
        # Not fatal here — the index build is where a bad export is refused. A
        # page that dropped every answer because one unrelated row had a
        # malformed date would be the same mistake as emptying the cruise table
        # on a failed fetch.
        logger.warning("guide_rows_rejected count=%d path=%s", len(rejected), path)
    return tuple(row for row in rows if row.is_indexable)


def _load(settings: Settings) -> tuple[KBRow, ...]:
    path = settings.kb_csv_path
    try:
        mtime = Path(path).stat().st_mtime
    except OSError:
        logger.warning("guide_csv_missing path=%s", path)
        return ()
    return _confirmed_rows(str(path), mtime)


def _describe(rows: tuple[KBRow, ...]) -> DataSource:
    """How a page of published answers must label itself.

    `published`, for the same reason the cruise schedule is: this is real SCASPA
    information with a date on it, and it is neither a live feed nor sample
    data. The timestamp is the **oldest** `as_of` in the set rather than the
    newest, because it is the only one that is true of everything on the screen
    — a page stamped with its freshest row would be advertising its best case.
    """
    if not rows:
        return DataSource(
            kind="unavailable",
            label="SCASPA published information",
            as_of=None,
            notice=(
                "Pilot has no verified information for this section yet. "
                "Nothing is shown rather than something guessed."
            ),
        )
    oldest = oldest_as_of(list(rows))
    return DataSource(
        kind="published",
        label="Verified SCASPA published information",
        as_of=datetime(oldest.year, oldest.month, oldest.day, tzinfo=UTC),
    )


def topics(category: str, settings: Settings | None = None) -> GuideResponse:
    """Confirmed answers for one category, grouped by subcategory.

    Grouped rather than flat because 19 questions in one list is a wall, and the
    subcategory is the researchers' own grouping — `parking`, `security`,
    `checkin` — not one this service invented. An empty subcategory becomes
    "General", which is the only string here that is ours, and it names a
    grouping rather than asserting a fact.
    """
    settings = settings or get_settings()
    wanted = category.strip().lower()
    rows = tuple(row for row in _load(settings) if row.category.lower() == wanted)

    grouped: dict[str, list[GuideEntry]] = {}
    for row in sorted(rows, key=lambda r: (r.subcategory, r.id)):
        grouped.setdefault(row.subcategory or "general", []).append(
            GuideEntry(
                id=row.id,
                question=row.question,
                answer=row.answer,
                source_url=row.source_url,
                as_of=row.as_of,
                # Carried through rather than dropped: a reader deciding whether
                # to ring and check is making a different decision for "rarely
                # changes" than for "check before use".
                volatility=row.volatility,
            )
        )

    return GuideResponse(
        source=_describe(rows),
        category=wanted,
        topics=[GuideTopic(name=name, entries=entries) for name, entries in grouped.items()],
        total=len(rows),
    )
