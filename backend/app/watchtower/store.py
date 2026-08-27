"""The structured operational store.

## Why this exists beside Chroma rather than inside it

Chroma answers "what did SCASPA write about pilotage" — a similarity question
over prose that changes rarely. It is the wrong tool for "which ships arrive on
Thursday", and putting the schedule in it would be wrong in three ways at once:
the answer would be approximate where the question is exact, a row could not be
updated without re-embedding it, and the assistant would have to read a date out
of a sentence rather than compare two dates.

So: operational rows here, explanatory prose in Chroma, and the agent picks.

## SQLite, deliberately

The spec permits PostgreSQL and this project has no database at all today —
Chroma keeps its own SQLite file and everything else is stateless. Introducing a
server, a connection pool and a migration tool to hold what is currently four
cruise calls would be the largest operational change in the project, made for
the smallest table in it. SQLite is a file next to the Chroma one, backed up by
copying it, and swappable later behind this module.

## Every row carries where it came from

`source_id`, `source_url`, `retrieved_at`, `content_hash`. Not because anything
reads all four today, but because a row that has lost its provenance cannot get
it back, and this is the store that answers customer questions.
"""

import json
import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path

from app.config import Settings, get_settings
from app.schemas import CruiseCall

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS source_state (
    source_id      TEXT PRIMARY KEY,
    url            TEXT NOT NULL,
    content_hash   TEXT,
    last_checked_at TEXT,
    last_changed_at TEXT,
    status         TEXT NOT NULL DEFAULT 'unknown',
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS source_change_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id     TEXT NOT NULL,
    checked_at    TEXT NOT NULL,
    previous_hash TEXT,
    new_hash      TEXT,
    outcome       TEXT NOT NULL,
    rows_parsed   INTEGER,
    detail        TEXT
);

CREATE INDEX IF NOT EXISTS idx_change_log_source ON source_change_log(source_id, checked_at DESC);

-- One row per published cruise call. `call_date` + `vessel` is the natural key:
-- the page has no id of its own, and two calls by the same ship on the same day
-- would be a publishing error rather than a case to model.
CREATE TABLE IF NOT EXISTS cruise_calls (
    call_date    TEXT NOT NULL,
    vessel       TEXT NOT NULL,
    day          TEXT NOT NULL DEFAULT '',
    window       TEXT NOT NULL DEFAULT '',
    cruise_line  TEXT NOT NULL DEFAULT '',
    pier         TEXT NOT NULL DEFAULT '',
    inaugural    INTEGER NOT NULL DEFAULT 0,
    pax          INTEGER,
    capacity     INTEGER,
    source_id    TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    PRIMARY KEY (call_date, vessel)
);

CREATE INDEX IF NOT EXISTS idx_cruise_date ON cruise_calls(call_date);
"""


def database_path(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    return settings.operational_db_path


@contextmanager
def connect(settings: Settings | None = None) -> Iterator[sqlite3.Connection]:
    """One connection, with the schema guaranteed present.

    `CREATE TABLE IF NOT EXISTS` on every open rather than a migration tool: at
    one table version that is the whole of what a migration tool would do, and
    it means a fresh checkout works with no setup step. When there is a second
    version this becomes a real migration and `schema_version` is already there
    to hang it off.
    """
    path = database_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        connection.executescript(_SCHEMA)
        yield connection
        connection.commit()
    finally:
        connection.close()


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ── source state ─────────────────────────────────────────────────────────────


def previous_hash(source_id: str, settings: Settings | None = None) -> str | None:
    with connect(settings) as db:
        row = db.execute(
            "SELECT content_hash FROM source_state WHERE source_id = ?", (source_id,)
        ).fetchone()
    return row["content_hash"] if row else None


def record_check(
    source_id: str,
    url: str,
    *,
    new_hash: str | None,
    changed: bool,
    outcome: str,
    rows_parsed: int | None = None,
    detail: str | None = None,
    settings: Settings | None = None,
) -> None:
    """Write what happened, whether or not anything changed.

    An unchanged check is still recorded on `source_state.last_checked_at`,
    because "the schedule has not moved since Tuesday" and "nobody has looked
    since Tuesday" are the same screen to a reader and opposite facts. Only
    actual changes go in the log, which is therefore a history of the source
    rather than of this service's uptime.
    """
    now = _now()
    with connect(settings) as db:
        existing = db.execute(
            "SELECT content_hash, last_changed_at FROM source_state WHERE source_id = ?",
            (source_id,),
        ).fetchone()
        last_changed = now if changed else (existing["last_changed_at"] if existing else None)
        db.execute(
            """
            INSERT INTO source_state
                (source_id, url, content_hash, last_checked_at, last_changed_at, status,
                 schema_version)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id) DO UPDATE SET
                url = excluded.url,
                content_hash = excluded.content_hash,
                last_checked_at = excluded.last_checked_at,
                last_changed_at = excluded.last_changed_at,
                status = excluded.status,
                schema_version = excluded.schema_version
            """,
            (source_id, url, new_hash, now, last_changed, outcome, SCHEMA_VERSION),
        )
        if changed or outcome != "unchanged":
            db.execute(
                """
                INSERT INTO source_change_log
                    (source_id, checked_at, previous_hash, new_hash, outcome, rows_parsed, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source_id,
                    now,
                    existing["content_hash"] if existing else None,
                    new_hash,
                    outcome,
                    rows_parsed,
                    detail,
                ),
            )


def source_state(source_id: str, settings: Settings | None = None) -> dict | None:
    with connect(settings) as db:
        row = db.execute("SELECT * FROM source_state WHERE source_id = ?", (source_id,)).fetchone()
    return dict(row) if row else None


def change_log(limit: int = 20, settings: Settings | None = None) -> list[dict]:
    with connect(settings) as db:
        rows = db.execute(
            "SELECT * FROM source_change_log ORDER BY checked_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


# ── cruise calls ─────────────────────────────────────────────────────────────


def replace_cruise_calls(
    calls: list[CruiseCall],
    *,
    source_id: str,
    source_url: str,
    content_hash: str,
    settings: Settings | None = None,
) -> int:
    """Swap in the published schedule, in one transaction.

    A replace rather than a merge, because the page IS the schedule: a call that
    has vanished from it has been cancelled or has sailed, and merging would
    leave this service asserting a cruise call that SCASPA has withdrawn. The
    published document is the truth and this table is a cache of it.

    All of it inside one transaction so a reader never sees the half-second
    where the old rows are gone and the new ones have not landed.
    """
    retrieved = _now()
    with connect(settings) as db:
        db.execute("DELETE FROM cruise_calls WHERE source_id = ?", (source_id,))
        db.executemany(
            """
            INSERT INTO cruise_calls
                (call_date, vessel, day, window, cruise_line, pier, inaugural, pax, capacity,
                 source_id, source_url, retrieved_at, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(call_date, vessel) DO UPDATE SET
                day = excluded.day, window = excluded.window,
                cruise_line = excluded.cruise_line, pier = excluded.pier,
                inaugural = excluded.inaugural, pax = excluded.pax,
                capacity = excluded.capacity, retrieved_at = excluded.retrieved_at,
                content_hash = excluded.content_hash
            """,
            [
                (
                    call.call_date.isoformat(),
                    call.vessel,
                    call.day,
                    call.window,
                    call.cruise_line,
                    call.pier,
                    int(call.inaugural),
                    call.pax,
                    call.capacity,
                    source_id,
                    source_url,
                    retrieved,
                    content_hash,
                )
                for call in calls
            ],
        )
    return len(calls)


def read_cruise_calls(
    *,
    since: date | None = None,
    until: date | None = None,
    vessel: str | None = None,
    limit: int = 100,
    settings: Settings | None = None,
) -> tuple[list[CruiseCall], int, datetime | None]:
    """Published calls, filtered, plus the total and when they were fetched.

    The retrieval time comes back with the rows rather than being looked up
    separately, because every caller needs it: a schedule rendered without the
    date it was fetched is the "live" claim this whole service exists to avoid.
    """
    where: list[str] = []
    params: list[object] = []
    if since:
        where.append("call_date >= ?")
        params.append(since.isoformat())
    if until:
        where.append("call_date <= ?")
        params.append(until.isoformat())
    if vessel:
        where.append("LOWER(vessel) LIKE ?")
        params.append(f"%{vessel.lower()}%")
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    with connect(settings) as db:
        total = db.execute(f"SELECT COUNT(*) AS n FROM cruise_calls {clause}", params).fetchone()[
            "n"
        ]
        rows = db.execute(
            f"SELECT * FROM cruise_calls {clause} ORDER BY call_date, vessel LIMIT ?",
            [*params, limit],
        ).fetchall()

    calls = [
        CruiseCall(
            call_date=date.fromisoformat(row["call_date"]),
            day=row["day"],
            window=row["window"],
            vessel=row["vessel"],
            cruise_line=row["cruise_line"],
            pier=row["pier"],
            inaugural=bool(row["inaugural"]),
            pax=row["pax"],
            capacity=row["capacity"],
        )
        for row in rows
    ]
    retrieved = (
        datetime.fromisoformat(rows[0]["retrieved_at"])
        if rows
        else _retrieved_at_fallback(settings)
    )
    return calls, total, retrieved


def _retrieved_at_fallback(settings: Settings | None) -> datetime | None:
    """When the table is empty, the check time still matters.

    An empty schedule with no timestamp reads as "we have never looked". An
    empty schedule stamped an hour ago reads as "SCASPA has published nothing
    for this period", which is a different and usually correct statement.
    """
    state = source_state("cruise_schedule", settings)
    if not state or not state.get("last_checked_at"):
        return None
    return datetime.fromisoformat(state["last_checked_at"])


def summary(settings: Settings | None = None) -> dict:
    """What the console and the health endpoint need to show freshness."""
    with connect(settings) as db:
        rows = db.execute("SELECT * FROM source_state").fetchall()
        counts = db.execute(
            "SELECT source_id, COUNT(*) AS n FROM cruise_calls GROUP BY source_id"
        ).fetchall()
    by_source = {row["source_id"]: row["n"] for row in counts}
    return {
        "schema_version": SCHEMA_VERSION,
        "sources": [{**dict(row), "rows": by_source.get(row["source_id"], 0)} for row in rows],
    }


def to_json(value: object) -> str:
    """Small helper for the change log's free-text detail column."""
    return json.dumps(value, default=str)
