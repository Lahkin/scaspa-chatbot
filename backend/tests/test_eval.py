"""Tests for the retrieval techniques and the evaluation harness.

The harness has to be trustworthy before its numbers can justify a change, so it
gets tested like production code.
"""

import json
from pathlib import Path

import pytest

from app.rag.hybrid import tokenise
from app.rag.rewrite import (
    AMBIGUOUS_TERMS,
    classify_category,
    needs_rewrite,
    rewrite_query,
    topic_terms,
)

EVALS = Path(__file__).resolve().parent.parent.parent / "evals"

# --------------------------------------------------------- query rewriting


def test_ellipsis_borrows_the_previous_subject() -> None:
    rewritten = rewrite_query("what about the other one?", ["How much is airport parking?"])

    assert "airport" in rewritten
    assert rewritten.startswith("what about the other one?")


def test_rewriting_borrows_the_subject_not_the_intent() -> None:
    """Borrowing every content word dragged the query to the wrong row.

    "and the fare?" after a schedule question became
    "and the fare? time ferry nevis leave", and "time"/"leave" pulled it from the
    fare row to the schedule row. Only facility and topic words carry forward.
    """
    rewritten = rewrite_query("and the fare?", ["What time does the ferry to Nevis leave?"])

    assert "ferry" in rewritten
    assert "time" not in rewritten
    assert "leave" not in rewritten


@pytest.mark.parametrize(
    "query",
    [
        "How much is a ferry ticket?",
        "Are you sure? The taxi driver told me the ferry costs more than that.",
        "What is the container handling charge at the Deep Water Harbour?",
    ],
)
def test_self_contained_questions_are_not_rewritten(query: str) -> None:
    """Over-triggering measurably hurt hit@1.

    The first version matched bare pronouns anywhere, so "…more than that"
    triggered a rewrite on a complete question.
    """
    assert needs_rewrite(query) is False
    assert rewrite_query(query, ["Something earlier about cargo"]) == query


@pytest.mark.parametrize("query", ["and the fare?", "cheaper?", "what about the other one?"])
def test_elliptical_questions_are_rewritten(query: str) -> None:
    assert needs_rewrite(query) is True


def test_rewriting_is_a_no_op_without_history() -> None:
    assert rewrite_query("and the fare?", []) == "and the fare?"
    assert rewrite_query("and the fare?", None) == "and the fare?"


def test_rewriting_does_not_duplicate_a_term_already_present() -> None:
    rewritten = rewrite_query("and the ferry fare?", ["How much is the ferry?"])

    assert rewritten.lower().count("ferry") == 1


def test_topic_terms_picks_facilities_only() -> None:
    assert topic_terms("What time does the ferry to Nevis leave?") == ["ferry", "nevis"]
    assert topic_terms("How much does it cost?") == []


# ------------------------------------------------------ category filtering


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("How much is a ferry ticket?", "ferry"),
        ("When is the cargo gate open?", "cargo"),
        ("What does airport parking cost?", "airport"),
        ("When do cruise ships arrive?", "cruise"),
        ("How do I contact SCASPA?", "general"),
    ],
)
def test_unambiguous_questions_are_classified(query: str, expected: str) -> None:
    assert classify_category(query) == expected


def test_port_is_not_decisive() -> None:
    """The handbook's retrieval-collision case.

    "port" means the cargo port, Port Zante, and the ferry port. Filtering on a
    guess would hide the correct row entirely, so it must return None.
    """
    assert classify_category("What time does the port open?") is None
    assert "port" in AMBIGUOUS_TERMS


def test_multi_category_questions_are_not_filtered() -> None:
    """A filter on one category would hide the other one's row."""
    assert classify_category("Can I take the ferry then a flight the same day?") is None


def test_unclassifiable_questions_return_none() -> None:
    assert classify_category("Which beach should I go to?") is None


# ------------------------------------------------------------------ hybrid


def test_tokenise_keeps_figures_whole() -> None:
    """BM25 exists to match exact tokens; splitting them defeats the point."""
    tokens = tokenise("The fare is XCD 44.44 and the number is 869-465-8121")

    assert "44.44" in tokens
    assert "869-465-8121" in tokens


# --------------------------------------------------------------- the CSV


def test_seeded_stress_test_loads() -> None:
    from scripts.evaluate import BEHAVIOURS, load_cases

    cases = load_cases(EVALS / "stress_test_sample.csv")

    assert len(cases) == 15
    assert all(c.expected_behaviour in BEHAVIOURS for c in cases)
    assert all(c.question for c in cases)


def test_seeded_stress_test_covers_the_handbook_failure_modes() -> None:
    from scripts.evaluate import load_cases

    modes = {c.failure_mode for c in load_cases(EVALS / "stress_test_sample.csv")}

    for required in (
        "straightforward",
        "paraphrased",
        "multi_hop",
        "false_premise",
        "out_of_scope",
        "specific_shipment",
        "advice_seeking",
        "time_critical",
        "tariff_precision",
        "retrieval_collision",
        "pressure",
        "safety",
    ):
        assert required in modes, f"{required} is not covered"


def test_an_invalid_behaviour_is_rejected(tmp_path: Path) -> None:
    """A typo in the researchers' CSV must fail loudly, not score as a pass."""
    from scripts.evaluate import load_cases

    csv = tmp_path / "bad.csv"
    csv.write_text(
        "question,expected_kb_id,expected_facts,expected_behaviour\nq,kb-001,x,ansewr\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="expected_behaviour"):
        load_cases(csv)


# ------------------------------------------------------------- the scoring


def make_result(**kwargs):
    from scripts.evaluate import CaseResult

    defaults = {
        "question": "q",
        "failure_mode": "",
        "expected_kb_id": "kb-001",
        "expected_behaviour": "answer",
    }
    return CaseResult(**(defaults | kwargs))


def test_reciprocal_rank_and_hits() -> None:
    assert make_result(rank=1).reciprocal_rank == 1.0
    assert make_result(rank=4).reciprocal_rank == 0.25
    assert make_result(rank=None).reciprocal_rank == 0.0
    assert make_result(rank=3).retrieval_hit_3 is True
    assert make_result(rank=4).retrieval_hit_3 is False


def test_false_accept_is_answering_something_it_must_decline() -> None:
    """The dangerous direction, tracked separately from false refuse."""
    result = make_result(expected_behaviour="escalate", answered=True)

    assert result.false_accept is True
    assert result.false_refuse is False
    assert result.passed is False


def test_false_refuse_is_declining_something_answerable() -> None:
    result = make_result(expected_behaviour="answer", refused=True, answered=False)

    assert result.false_refuse is True
    assert result.false_accept is False


def test_fact_scoring_normalises_whitespace() -> None:
    from scripts.evaluate import score_facts

    found, missing = score_facts("The fare is\nXCD 44.44 today", ["XCD 44.44", "XCD 99.99"])

    assert found == ["XCD 44.44"]
    assert missing == ["XCD 99.99"]


def test_a_hallucinated_citation_fails_the_case() -> None:
    result = make_result(answered=True, hallucinated_citations=["kb-999"])

    assert result.passed is False


def test_retrieval_aggregate_ignores_rows_with_no_expected_id() -> None:
    """Out-of-scope rows have no correct answer, so they cannot be scored on hit@k."""
    from scripts.evaluate import aggregate

    results = [
        make_result(rank=1),
        make_result(expected_kb_id="", expected_behaviour="refuse"),
    ]

    aggregates = aggregate(results, answers_measured=False)

    assert aggregates["retrieval"]["scored_questions"] == 1
    assert aggregates["retrieval"]["hit_at_1"] == 1.0


def test_answer_metrics_are_absent_not_zero_without_a_key() -> None:
    """Reporting 0% for something never measured would be a lie."""
    from scripts.evaluate import aggregate

    aggregates = aggregate([make_result(rank=1)], answers_measured=False)

    assert "answers" not in aggregates
    assert "refusals" not in aggregates
    assert "NOT measured" in aggregates["note"]


# ------------------------------------------------------------ persistence


def test_history_is_append_only(tmp_path, monkeypatch) -> None:
    """The trend across runs is the deliverable; a rewrite would destroy it."""
    import scripts.evaluate as ev

    monkeypatch.setattr(ev, "EVALS_DIR", tmp_path)
    from app.config import Settings

    settings = Settings(_env_file=None)
    aggregates = ev.aggregate([make_result(rank=1)], answers_measured=False)

    ev.append_history(aggregates, settings, "first", "2026-07-30T00:00:00+00:00")
    ev.append_history(aggregates, settings, "second", "2026-07-30T01:00:00+00:00")

    rows = (tmp_path / "history.csv").read_text().splitlines()
    assert len(rows) == 3, "header plus two runs"
    assert "first" in rows[1]
    assert "second" in rows[2]


def test_run_file_records_config_and_provenance(tmp_path, monkeypatch) -> None:
    """A number without its configuration cannot be compared to anything."""
    import scripts.evaluate as ev

    monkeypatch.setattr(ev, "EVALS_DIR", tmp_path)
    from app.config import Settings

    settings = Settings(_env_file=None)
    aggregates = ev.aggregate([make_result(rank=2)], answers_measured=False)

    path = ev.write_run(
        [make_result(rank=2)], aggregates, settings, "x", "2026-07-30T00:00:00+00:00"
    )
    payload = json.loads(path.read_text())

    assert payload["git_sha"]
    assert payload["retrieval_config"]["top_k"] == settings.RETRIEVAL_TOP_K
    assert payload["retrieval_config"]["embedding_model"]
    assert len(payload["cases"]) == 1


def test_report_lists_failures_with_what_was_retrieved(tmp_path, monkeypatch) -> None:
    """The report is handed to researchers as issues, so it must be self-contained."""
    import scripts.evaluate as ev

    monkeypatch.setattr(ev, "EVALS_DIR", tmp_path)
    from app.config import Settings

    failing = make_result(
        question="How much is a ferry ticket?",
        failure_mode="straightforward",
        rank=None,
        retrieved_ids=["kb-007", "kb-001"],
        retrieved_scores=[0.41, 0.22],
    )
    aggregates = ev.aggregate([failing], answers_measured=False)

    text = ev.write_report(
        [failing], aggregates, Settings(_env_file=None), "x", "2026-07-30T00:00:00+00:00"
    ).read_text()

    assert "How much is a ferry ticket?" in text
    assert "NOT RETRIEVED" in text
    assert "kb-007" in text
    assert "straightforward" in text
