"""Ingestion tests: confidence gating, hash caching, dry run."""

import shutil
from pathlib import Path

from app.rag.ingest import build_kb_index, index_meta_path, read_index_meta, sha256_file
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
