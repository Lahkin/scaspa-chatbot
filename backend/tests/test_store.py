"""Score-direction tests.

This is the highest-value test in the ingestion work. Chroma's raw method
returns a *distance* (lower is better). If the wrapper ever stops inverting it,
retrieval silently returns the worst matches for every question — no exception,
no log line, just wrong answers with confident citations.

The direction is asserted with two obviously-different fake documents.
"""

import pytest

from app.rag.store import (
    KB_COLLECTION,
    WEB_COLLECTION,
    get_store,
    normalise_score,
    reset,
    search,
)

FERRY_DOC = "Category: ferry — schedule\nAnswer: SAMPLE DATA fake sailing at 04:04."
CARGO_DOC = "Category: cargo — tariffs\nAnswer: SAMPLE DATA fake charge XCD 333.33."


@pytest.fixture
def loaded_store(tmp_settings, fake_embeddings):
    store = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)
    store.add_texts([FERRY_DOC, CARGO_DOC], ids=["kb-001", "kb-002"])
    return store


def test_higher_score_means_more_relevant(loaded_store) -> None:
    """The whole contract in one assertion."""
    results = search(loaded_store, "ferry", k=2)

    assert results[0].page_content == FERRY_DOC, (
        "the ferry document must rank first for a ferry query; "
        "if cargo ranks first the distance/similarity inversion has been lost"
    )
    assert results[0].score > results[1].score


def test_scores_are_normalised_to_zero_one(loaded_store) -> None:
    results = search(loaded_store, "ferry", k=2)

    assert all(0.0 <= r.score <= 1.0 for r in results)
    assert results[0].score == pytest.approx(1.0), "identical direction scores 1.0"
    assert results[1].score == pytest.approx(0.0), "orthogonal direction scores 0.0"


def test_wrapper_inverts_chromas_raw_distance(loaded_store) -> None:
    """Pin the inversion explicitly, so a regression fails loudly here.

    Chroma's raw ordering is the reverse of ours: it puts the *best* match at the
    *lowest* number.
    """
    raw = loaded_store.similarity_search_with_score("ferry", k=2)
    best_raw_doc, best_raw_distance = min(raw, key=lambda pair: pair[1])
    worst_raw_doc, worst_raw_distance = max(raw, key=lambda pair: pair[1])

    assert best_raw_distance < worst_raw_distance
    assert best_raw_doc.page_content == FERRY_DOC

    wrapped = search(loaded_store, "ferry", k=2)
    assert wrapped[0].page_content == best_raw_doc.page_content
    assert wrapped[0].score > wrapped[-1].score
    assert wrapped[-1].page_content == worst_raw_doc.page_content


def test_results_are_sorted_best_first(loaded_store) -> None:
    results = search(loaded_store, "cargo", k=2)

    assert results[0].page_content == CARGO_DOC
    assert [r.score for r in results] == sorted((r.score for r in results), reverse=True)


def test_min_score_filters_the_irrelevant(loaded_store) -> None:
    results = search(loaded_store, "ferry", k=2, min_score=0.5)

    assert len(results) == 1, "the orthogonal document scores 0.0 and must be filtered out"
    assert results[0].page_content == FERRY_DOC


@pytest.mark.parametrize(
    ("distance", "expected"),
    [
        (0.0, 1.0),  # identical
        (0.5, 0.5),
        (1.0, 0.0),  # orthogonal
        (2.0, 0.0),  # opposite — clamped, never negative
        (-0.0001, 1.0),  # float noise above 1 — clamped
    ],
)
def test_normalise_score_is_monotonic_and_clamped(distance: float, expected: float) -> None:
    assert normalise_score(distance) == pytest.approx(expected)


def test_normalise_score_decreases_as_distance_grows() -> None:
    scores = [normalise_score(d) for d in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]

    assert scores == sorted(scores, reverse=True)


def test_reset_empties_a_collection(loaded_store, tmp_settings, fake_embeddings) -> None:
    assert search(loaded_store, "ferry", k=2)

    reset(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)

    fresh = get_store(KB_COLLECTION, embeddings=fake_embeddings, settings=tmp_settings)
    assert search(fresh, "ferry", k=2) == []


def test_unknown_collection_is_rejected(tmp_settings, fake_embeddings) -> None:
    with pytest.raises(ValueError, match="unknown collection"):
        get_store("scaspa_nope", embeddings=fake_embeddings, settings=tmp_settings)


def test_both_collections_are_available(tmp_settings, fake_embeddings) -> None:
    for name in (KB_COLLECTION, WEB_COLLECTION):
        assert get_store(name, embeddings=fake_embeddings, settings=tmp_settings) is not None
