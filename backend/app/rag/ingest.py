"""Build the searchable index from the researchers' CSV.

Only rows with `confidence == "confirmed"` are indexed for the live assistant
(CLAUDE.md rule 8). Rows at `probable` or `unverified` are counted and reported
so the researchers can see what is being held back, but they never reach the
index.

Embedding costs real money, so a rebuild is skipped when the source CSV is
byte-for-byte unchanged. The decision is made on a SHA-256 of the file recorded
in `data/index_meta.json`, not on mtime, which changes on every re-export even
when the content does not.

## Blocklisted links are redacted here, before anything is embedded

CLAUDE.md rule 3 forbids linking to `pay.scaspa.com`. The researchers' export
carries five confirmed rows whose `source_url` **is** that portal, and
`source_url` travels the whole way: row -> chunk metadata -> `Citation` ->
`SourceEntry`, which renders it as an `href`. Indexing those rows unchanged
would put a live, clickable payment link in front of a user.

The existing `SCRAPER_BLOCKLIST` guard only stops the crawler *fetching* the
host; nothing filtered *content*. `redact_blocked_links` closes that, reusing
the same setting so the host stays configured in one place. The rows themselves
stay indexed and answerable — the question of whether the assistant should route
someone to a payment portal is SCASPA's policy decision, not a side effect of a
CSV field.
"""

import hashlib
import re
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.parse import urlparse

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.rag.chunking import chunk_kb_rows
from app.rag.loader import load_kb_csv, summarise
from app.rag.models import INDEXABLE_CONFIDENCE, KBRow, RejectedRow
from app.rag.store import KB_COLLECTION, WEB_COLLECTION, count, get_store, reset

INDEX_META_FILENAME = "index_meta.json"
EMBED_BATCH_SIZE = 64

_DATE_IN_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})")

Echo = Callable[[str], None]


class IndexMeta(BaseModel):
    """Contents of `data/index_meta.json`.

    This is the handshake between the build script and `/api/health`: it is how
    a running service knows what is actually in its index.
    """

    kb_version: str
    kb_csv_sha256: str
    kb_csv_filename: str
    kb_rows_indexed: int
    kb_rows_rejected: int
    kb_updated_at: date | None
    index_built_at: datetime
    embedding_model: str
    web_docs: int
    web_built_at: datetime | None = None


class BuildResult(BaseModel):
    """Outcome of one build, for the script to report on."""

    meta: IndexMeta | None
    skipped: bool
    dry_run: bool
    valid_rows: int
    rejected_rows: int
    indexed_rows: int
    withheld_by_confidence: dict[str, int]
    summary: str


def index_meta_path(settings: Settings | None = None) -> Path:
    """Location of `index_meta.json` — the data directory beside the Chroma dir."""
    settings = settings or get_settings()
    return settings.chroma_path.parent / INDEX_META_FILENAME


def sha256_file(path: Path) -> str:
    """SHA-256 of a file's bytes, read in chunks so large exports are fine."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def read_index_meta(settings: Settings | None = None) -> IndexMeta | None:
    """Load `index_meta.json`, or None if it is missing or unreadable.

    A corrupt or absent file is a normal state — the index has simply never been
    built. Callers report that; they must not crash on it.
    """
    path = index_meta_path(settings)
    if not path.exists():
        return None
    try:
        return IndexMeta.model_validate_json(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def write_index_meta(meta: IndexMeta, settings: Settings | None = None) -> Path:
    """Write `index_meta.json`, creating the data directory if needed."""
    path = index_meta_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(meta.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return path


def derive_kb_version(csv_path: Path, rows: list[KBRow], sha256: str) -> str:
    """Human-meaningful version for the knowledge base.

    Prefers the date the researchers put in the filename
    (`scaspa_kb_2026-08-04.csv`), since that is what they refer to in
    conversation. Falls back to the newest `as_of` in the data, then to a short
    hash so the field is never empty.
    """
    match = _DATE_IN_NAME.search(csv_path.name)
    if match:
        return match.group(1)
    if rows:
        return max(r.as_of for r in rows).isoformat()
    return sha256[:12]


def _host_of(url: str) -> str:
    """The lowercase hostname of `url`, with or without a scheme.

    A `source_url` is normally `https://host/path`, but a researcher may type a
    bare `host/path`. `urlparse` puts a scheme-less string entirely in `path` and
    reports no hostname at all, so a bare host would slip past the blocklist —
    which is the one thing this must not do.
    """
    raw = url.strip()
    parsed = urlparse(raw if "//" in raw else f"//{raw}", scheme="https")
    return (parsed.hostname or "").lower()


def _blocked_host(url: str, blocklist: set[str]) -> str | None:
    """The blocklisted host this URL points at, or None.

    Subdomains match too: blocking `scaspa.com` would block `pay.scaspa.com`.
    Scheme, port, path and case are all ignored.
    """
    host = _host_of(url)
    if not host:
        return None
    for blocked in blocklist:
        if host == blocked or host.endswith(f".{blocked}"):
            return blocked
    return None


def redact_blocked_links(
    rows: list[KBRow],
    settings: Settings,
    echo: Echo = print,
) -> tuple[list[KBRow], list[str]]:
    """Blank `source_url` on every row pointing at a blocklisted host.

    Returns the rows and the ids that were redacted. See the module docstring for
    why this exists; the short version is CLAUDE.md rule 3 and the fact that
    `source_url` is rendered as an `href`.

    The row is kept and stays answerable. Only the link goes.
    """
    blocklist = settings.scraper_blocklist_set
    if not blocklist:
        return rows, []

    kept: list[KBRow] = []
    redacted: list[str] = []

    for row in rows:
        blocked = _blocked_host(row.source_url, blocklist)
        if blocked is None:
            kept.append(row)
            continue
        redacted.append(row.id)
        # `model_copy`, not a re-validated construct: `source_url` carries a
        # non-empty validator whose job is to reject a researcher row that has no
        # source at all. This is not that — it is a deliberate redaction of a row
        # that validated fine, and "" is exactly the value `SourceEntry` already
        # draws as "no link recorded".
        kept.append(row.model_copy(update={"source_url": ""}))

    if redacted:
        echo("")
        echo(f"  Redacted source_url on {len(redacted)} row(s) — blocklisted host (rule 3)")
        echo(f"    {', '.join(redacted)}")

    return kept, redacted


def _batched(documents: list[Document], size: int) -> Iterator[list[Document]]:
    for start in range(0, len(documents), size):
        yield documents[start : start + size]


def build_kb_index(
    csv_path: Path | str | None = None,
    *,
    force: bool = False,
    dry_run: bool = False,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
    echo: Echo = print,
) -> BuildResult:
    """Validate the CSV and, unless skipped, embed the confirmed rows.

    Returns a `BuildResult` describing what happened. The caller decides the exit
    code; this function raises only on genuinely broken input.
    """
    settings = settings or get_settings()

    # KB_CSV_PATH may be a symlink such as `latest.csv`. Resolve it so the
    # recorded filename is the real dated export, not the pointer.
    raw_path = Path(csv_path) if csv_path else settings.kb_csv_path
    resolved = raw_path.expanduser().resolve()
    if resolved.name != raw_path.name:
        echo(f"  resolved {raw_path.name} -> {resolved.name}")

    valid, rejected = load_kb_csv(resolved)
    # Before the summary, and long before anything is embedded: a blocklisted
    # link must not reach the index, the metadata or the report.
    valid, _redacted = redact_blocked_links(valid, settings, echo)
    summary = summarise(valid, rejected, resolved)
    echo(summary)

    indexable = [row for row in valid if row.is_indexable]
    withheld: dict[str, int] = {}
    for row in valid:
        if not row.is_indexable:
            withheld[row.confidence] = withheld.get(row.confidence, 0) + 1

    if withheld:
        echo("")
        echo(f"  Withheld from the index (confidence != {INDEXABLE_CONFIDENCE!r})")
        echo("  " + "-" * 46)
        for level, n in sorted(withheld.items()):
            echo(f"    {level:<38} {n:>4}")
    echo("")
    echo(f"  Indexable rows: {len(indexable)} of {len(valid)} valid")

    def result(meta: IndexMeta | None, *, skipped: bool, indexed: int) -> BuildResult:
        return BuildResult(
            meta=meta,
            skipped=skipped,
            dry_run=dry_run,
            valid_rows=len(valid),
            rejected_rows=len(rejected),
            indexed_rows=indexed,
            withheld_by_confidence=withheld,
            summary=summary,
        )

    if dry_run:
        echo("")
        echo("  --dry-run: validated only. Nothing embedded, index_meta.json not written.")
        return result(None, skipped=False, indexed=0)

    digest = sha256_file(resolved)
    previous = read_index_meta(settings)

    if previous and previous.kb_csv_sha256 == digest and not force:
        echo("")
        echo(f"  CSV unchanged (sha256 {digest[:12]}…) and --force not passed.")
        echo(f"  Skipping re-embedding. Index built {previous.index_built_at.isoformat()}.")
        echo("  Pass --force to rebuild anyway.")
        return result(previous, skipped=True, indexed=previous.kb_rows_indexed)

    documents = chunk_kb_rows(indexable)
    echo("")
    echo(f"  Embedding {len(documents)} chunks with {settings.OPENAI_EMBEDDING_MODEL}…")

    # A full rebuild rather than an upsert: rows can be deleted from the sheet,
    # and an upsert would leave those stale chunks in the index forever.
    reset(KB_COLLECTION, embeddings=embeddings, settings=settings)
    store = get_store(KB_COLLECTION, embeddings=embeddings, settings=settings)

    done = 0
    for batch in _batched(documents, EMBED_BATCH_SIZE):
        store.add_documents(batch, ids=[d.id for d in batch])
        done += len(batch)
        pct = done * 100 // max(len(documents), 1)
        echo(f"    [{pct:>3}%] {done}/{len(documents)} chunks")

    web_store = get_store(WEB_COLLECTION, embeddings=embeddings, settings=settings)

    meta = IndexMeta(
        kb_version=derive_kb_version(resolved, indexable, digest),
        kb_csv_sha256=digest,
        kb_csv_filename=resolved.name,
        kb_rows_indexed=len(documents),
        kb_rows_rejected=len(rejected),
        # When the knowledge itself was last verified, not when we embedded it.
        kb_updated_at=max((r.as_of for r in indexable), default=None),
        index_built_at=datetime.now(UTC),
        embedding_model=settings.OPENAI_EMBEDDING_MODEL,
        # Carry the web side through untouched — a knowledge-base rebuild must
        # not appear to have wiped the scraped index.
        web_docs=count(web_store),
        web_built_at=(previous.web_built_at if previous else None),
    )
    path = write_index_meta(meta, settings)
    echo("")
    echo(f"  Wrote {path}")

    return result(meta, skipped=False, indexed=len(documents))


def rejected_report(rejected: list[RejectedRow]) -> str:
    """Every rejection, one per line, for a log or a message to the researchers."""
    return "\n".join(row.format() for row in rejected)
