"""Retriever tests."""

import pytest

from app.rag.ingest import build_kb_index
from app.rag.retriever import _build_where, retrieve


@pytest.fixture
def indexed(sample_csv, tmp_settings, fake_embeddings):
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )
    return tmp_settings


def test_retrieve_returns_scored_chunks(indexed, fake_embeddings) -> None:
    chunks = retrieve("ferry", embeddings=fake_embeddings, settings=indexed)

    assert chunks
    assert all(0.0 <= c.score <= 1.0 for c in chunks)
    assert all(c.id.startswith("kb-") for c in chunks)
    assert all(c.metadata["source_kind"] == "kb" for c in chunks)


def test_results_are_sorted_best_first(indexed, fake_embeddings) -> None:
    chunks = retrieve("ferry", k=5, embeddings=fake_embeddings, settings=indexed)

    scores = [c.score for c in chunks]
    assert scores == sorted(scores, reverse=True)


def test_k_defaults_to_settings_top_k(indexed, fake_embeddings) -> None:
    chunks = retrieve("ferry", embeddings=fake_embeddings, settings=indexed)

    assert len(chunks) <= indexed.RETRIEVAL_TOP_K


def test_explicit_k_is_honoured(indexed, fake_embeddings) -> None:
    assert len(retrieve("ferry", k=2, embeddings=fake_embeddings, settings=indexed)) <= 2


def test_category_filter_restricts_results(indexed, fake_embeddings) -> None:
    chunks = retrieve("fare", k=10, category="ferry", embeddings=fake_embeddings, settings=indexed)

    assert chunks
    assert all(c.metadata["category"] == "ferry" for c in chunks)


def test_source_kind_filter_restricts_results(indexed, fake_embeddings) -> None:
    chunks = retrieve("ferry", k=10, source_kind="kb", embeddings=fake_embeddings, settings=indexed)
    assert chunks

    none = retrieve(
        "ferry", k=10, source_kind="website", embeddings=fake_embeddings, settings=indexed
    )
    assert none == [], "no web documents are indexed yet"


def test_combined_filters_use_an_and_clause() -> None:
    """Chroma rejects a bare multi-key dict; it needs an explicit $and."""
    assert _build_where("ferry", "kb") == {"$and": [{"category": "ferry"}, {"source_kind": "kb"}]}


def test_single_filter_is_a_plain_clause() -> None:
    assert _build_where("ferry", None) == {"category": "ferry"}
    assert _build_where(None, "kb") == {"source_kind": "kb"}


def test_no_filter_is_none() -> None:
    assert _build_where(None, None) is None


def test_min_score_floor_is_applied(indexed, fake_embeddings) -> None:
    chunks = retrieve("ferry", k=10, min_score=0.9, embeddings=fake_embeddings, settings=indexed)

    assert all(c.score >= 0.9 for c in chunks)


def test_withheld_rows_are_never_retrievable(indexed, fake_embeddings) -> None:
    """kb-003 (probable) and kb-009 (unverified) are not in the index at all."""
    chunks = retrieve("luggage taxi", k=12, embeddings=fake_embeddings, settings=indexed)

    ids = {c.id for c in chunks}
    assert "kb-003" not in ids
    assert "kb-009" not in ids
