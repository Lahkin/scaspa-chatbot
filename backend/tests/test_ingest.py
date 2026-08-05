"""Ingestion tests: confidence gating, hash caching, dry run."""

import shutil
from datetime import date
from pathlib import Path

from app.rag.ingest import (
    build_kb_index,
    index_meta_path,
    read_index_meta,
    redact_blocked_links,
    sha256_file,
)
from app.rag.models import KBRow
from app.rag.store import KB_COLLECTION, get_store, search


def quiet(_: str) -> None:
    """Swallow build progress output in tests."""


def build(csv, settings, embeddings, **kwargs):
    return build_kb_index(
        csv_path=csv, settings=settings, embeddings=embeddings, echo=quiet, **kwargs
    )


def test_only_confirmed_rows_are_indexed(sample_csv, tmp_settings, fake_embeddings) -> None:
    """CLAUDE.md rule 8. The fixture holds 10 confirmed, 1 probable, 1 unverified."""
    result = build(sample_csv, tmp_settings, fake_embeddings)

    assert result.valid_rows == 12
    assert result.indexed_rows == 10
    assert result.withheld_by_confidence == {"probable": 1, "unverified": 1}


def test_withheld_rows_are_absent_from_the_index(sample_csv, tmp_settings, fake_embeddings) -> None:
    build(sample_csv, tmp_settings, fake_embeddings)

    store = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)
    indexed_ids = set(store.get()["ids"])

    assert "kb-003" not in indexed_ids, "kb-003 is 'probable' and must not be indexed"
    assert "kb-009" not in indexed_ids, "kb-009 is 'unverified' and must not be indexed"
    assert "kb-001" in indexed_ids


def test_meta_is_written_with_the_agreed_fields(sample_csv, tmp_settings, fake_embeddings) -> None:
    result = build(sample_csv, tmp_settings, fake_embeddings)

    meta = read_index_meta(tmp_settings)
    assert meta is not None
    assert meta == result.meta
    assert meta.kb_csv_sha256 == sha256_file(Path(sample_csv))
    assert meta.kb_csv_filename == "sample_kb.csv"
    assert meta.kb_rows_indexed == 10
    assert meta.kb_rows_rejected == 0
    assert meta.embedding_model == tmp_settings.OPENAI_EMBEDDING_MODEL
    assert meta.web_docs == 0
    assert meta.kb_updated_at.isoformat() == "2026-06-01"


def test_rerun_with_unchanged_csv_skips_embedding(
    sample_csv, tmp_settings, fake_embeddings
) -> None:
    """Re-embedding an unchanged CSV costs real money for no benefit."""
    first = build(sample_csv, tmp_settings, fake_embeddings)
    second = build(sample_csv, tmp_settings, fake_embeddings)

    assert first.skipped is False
    assert second.skipped is True
    assert second.meta.index_built_at == first.meta.index_built_at, (
        "a skipped build must not restamp the build time"
    )


def test_force_rebuilds_even_when_unchanged(sample_csv, tmp_settings, fake_embeddings) -> None:
    first = build(sample_csv, tmp_settings, fake_embeddings)
    forced = build(sample_csv, tmp_settings, fake_embeddings, force=True)

    assert forced.skipped is False
    assert forced.meta.index_built_at > first.meta.index_built_at


def test_changed_csv_triggers_a_rebuild(
    sample_csv, tmp_settings, fake_embeddings, tmp_path
) -> None:
    copy = tmp_path / "kb_copy.csv"
    shutil.copy(sample_csv, copy)
    build(copy, tmp_settings, fake_embeddings)

    copy.write_text(
        copy.read_text(encoding="utf-8").replace("XCD 111.11", "XCD 121.21"), encoding="utf-8"
    )
    again = build(copy, tmp_settings, fake_embeddings)

    assert again.skipped is False, "a content change must invalidate the cache"


def test_dry_run_embeds_nothing_and_writes_no_meta(
    sample_csv, tmp_settings, fake_embeddings
) -> None:
    result = build(sample_csv, tmp_settings, fake_embeddings, dry_run=True)

    assert result.dry_run is True
    assert result.indexed_rows == 0
    assert result.valid_rows == 12
    assert not index_meta_path(tmp_settings).exists()


def test_symlink_is_resolved_to_the_real_filename(
    sample_csv, tmp_settings, fake_embeddings, tmp_path
) -> None:
    """KB_CSV_PATH may be a `latest.csv` pointer; the dated file is what matters."""
    dated = tmp_path / "scaspa_kb_2026-08-04.csv"
    shutil.copy(sample_csv, dated)
    link = tmp_path / "latest.csv"
    link.symlink_to(dated)

    result = build(link, tmp_settings, fake_embeddings)

    assert result.meta.kb_csv_filename == "scaspa_kb_2026-08-04.csv"
    assert result.meta.kb_version == "2026-08-04", "version comes from the dated filename"


def test_rebuild_drops_rows_deleted_from_the_sheet(
    sample_csv, tmp_settings, fake_embeddings, tmp_path
) -> None:
    """A rebuild must not leave stale chunks behind."""
    copy = tmp_path / "kb.csv"
    shutil.copy(sample_csv, copy)
    build(copy, tmp_settings, fake_embeddings)

    kept = [ln for ln in copy.read_text(encoding="utf-8").splitlines() if not ln.startswith("kb-0")]
    copy.write_text("\n".join(kept) + "\n", encoding="utf-8")
    build(copy, tmp_settings, fake_embeddings, force=True)

    store = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)
    assert store.get()["ids"] == []


def test_indexed_content_is_searchable(sample_csv, tmp_settings, fake_embeddings) -> None:
    build(sample_csv, tmp_settings, fake_embeddings)
    store = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)

    results = search(store, "ferry", k=3, min_score=0.5)

    assert results
    assert all(r.metadata["confidence"] == "confirmed" for r in results)
    assert all("notes" not in r.metadata for r in results)


# ── Blocklisted links — CLAUDE.md rule 3 ─────────────────────────────────────
#
# `source_url` is rendered as an `href` by the client, so a row pointing at
# pay.scaspa.com would put a live payment link in front of a user. The row is
# kept and stays answerable; only the link is removed.


def test_a_blocklisted_source_url_is_blanked(tmp_settings) -> None:
    """The portal must not survive ingestion as a link."""
    rows = [
        _row("kb-001", "https://pay.scaspa.com/"),
        _row("kb-002", "https://www.scaspa.com/tariffs.html"),
    ]

    kept, redacted = redact_blocked_links(rows, tmp_settings, echo=quiet)

    assert redacted == ["kb-001"]
    assert kept[0].source_url == "", "the link is gone"
    assert kept[0].answer == rows[0].answer, "the row itself is untouched and still answerable"
    assert kept[1].source_url == "https://www.scaspa.com/tariffs.html", "other hosts are left alone"


def test_a_blocklisted_host_is_matched_however_it_is_written(tmp_settings) -> None:
    """Scheme, case, port, path and a missing scheme must all fail to get past it."""
    written = [
        "https://pay.scaspa.com/",
        "http://pay.scaspa.com/checkout?amount=100",
        "https://PAY.scaspa.com:443/",
        "pay.scaspa.com/receipt",
    ]
    rows = [_row(f"kb-{i:03d}", url) for i, url in enumerate(written, start=1)]

    kept, redacted = redact_blocked_links(rows, tmp_settings, echo=quiet)

    assert len(redacted) == len(written), f"one of these slipped through: {written}"
    assert all(row.source_url == "" for row in kept)


def test_a_blocklisted_link_never_reaches_the_index(
    tmp_path, tmp_settings, fake_embeddings
) -> None:
    """The end-to-end guarantee: not in the chunk metadata, not anywhere."""
    csv = tmp_path / "portal_kb.csv"
    csv.write_text(
        "id,category,subcategory,question,answer,keywords,audience,"
        "source_url,source_type,as_of,volatility,confidence,notes\n"
        "kb-001,payments,portal,Can I pay online?,"
        "SAMPLE DATA — a placeholder answer about paying.,,all,"
        "https://pay.scaspa.com/,official-site,2026-01-01,low,confirmed,\n",
        encoding="utf-8",
    )

    build(csv, tmp_settings, fake_embeddings)

    store = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)
    stored = store.get()
    assert stored["ids"] == ["kb-001"], "the row is still indexed and still answerable"
    assert stored["metadatas"][0]["source_url"] == ""
    assert "pay.scaspa.com" not in str(stored["metadatas"])


def _row(row_id: str, source_url: str) -> KBRow:
    """A minimal valid row. Obviously-fake content — CLAUDE.md rule 5."""
    return KBRow(
        id=row_id,
        category="payments",
        subcategory="portal",
        question="Sample question?",
        answer="SAMPLE DATA — a placeholder answer.",
        keywords="",
        audience="all",
        source_url=source_url,
        source_type="official-site",
        as_of=date(2026, 1, 1),
        volatility="low",
        confidence="confirmed",
        notes="",
    )
