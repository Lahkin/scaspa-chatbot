"""Answer-chain tests — the safety-critical ones.

None of these need an OpenAI key. The chat model is a stub whose output we
control, which is exactly what lets us assert that the *backend* refuses to
trust it.
"""

import logging

import pytest

from app.agent.prompts import ESCALATION_BLOCK, NO_ANSWER_MESSAGE, REFUSAL_MESSAGE
from app.rag.answer import (
    answer_question,
    build_citations,
    extract_citations,
    find_unverified_figures,
    format_context,
    match_refusal_category,
    verify_citations,
)
from app.rag.ingest import build_kb_index
from app.rag.retriever import RetrievedChunk

# --------------------------------------------------------------------- stubs


class StubModel:
    """Returns a canned answer and records what it was asked."""

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls: list[list] = []

    def invoke(self, messages):
        self.calls.append(messages)
        return type("Msg", (), {"content": self.reply})()


class ExplodingModel:
    """Fails the test if it is ever called."""

    def invoke(self, messages):  # noqa: ARG002
        raise AssertionError("the model must not be called on a low-confidence question")


def chunk(kb_id: str, text: str = "Answer: placeholder.", score: float = 0.9) -> RetrievedChunk:
    return RetrievedChunk(
        id=kb_id,
        text=text,
        score=score,
        metadata={
            "id": kb_id,
            "category": "ferry",
            "subcategory": "fares",
            "source_url": f"https://example.invalid/{kb_id}",
            "source_type": "official-site",
            "as_of": "2026-04-01",
            "confidence": "confirmed",
        },
    )


# ------------------------------------------------------- citation extraction


def test_extract_citations_finds_markers() -> None:
    assert extract_citations("Fare is X [kb-008]. Times vary [kb-007].") == ["kb-008", "kb-007"]


def test_extract_citations_deduplicates_preserving_order() -> None:
    assert extract_citations("[kb-008] a [kb-007] b [kb-008]") == ["kb-008", "kb-007"]


def test_extract_citations_accepts_three_and_four_digit_ids() -> None:
    assert extract_citations("[kb-001] and [kb-1234]") == ["kb-001", "kb-1234"]


def test_extract_citations_ignores_non_matching_brackets() -> None:
    assert extract_citations("[see below] [KB-001] [kb-1] [kb-12345]") == []


# ------------------------------------------------------- citation validation


def test_valid_citation_is_kept() -> None:
    text, verified, hallucinated = verify_citations("Fare is X [kb-008].", {"kb-008"})

    assert text == "Fare is X [kb-008]."
    assert verified == ["kb-008"]
    assert hallucinated == []


def test_hallucinated_citation_is_stripped_from_the_text() -> None:
    """The core guarantee: a marker for a row we never retrieved cannot survive."""
    text, verified, hallucinated = verify_citations("Fare is X [kb-999].", {"kb-008"})

    assert "[kb-999]" not in text
    assert text == "Fare is X."
    assert verified == []
    assert hallucinated == ["kb-999"]


def test_mixed_citations_keep_the_real_one_and_drop_the_fake() -> None:
    text, verified, hallucinated = verify_citations(
        "Fare is X [kb-008]. Ferries run daily [kb-999].", {"kb-008", "kb-007"}
    )

    assert "[kb-008]" in text
    assert "[kb-999]" not in text
    assert verified == ["kb-008"]
    assert hallucinated == ["kb-999"]


def test_stripping_leaves_clean_punctuation() -> None:
    text, _, _ = verify_citations("The fare is XCD 44.44 [kb-999] and it varies.", {"kb-008"})

    assert text == "The fare is XCD 44.44 and it varies."
    assert "  " not in text


def test_every_occurrence_of_a_bad_id_is_removed() -> None:
    text, _, hallucinated = verify_citations("A [kb-999] B [kb-999] C [kb-999]", {"kb-008"})

    assert "kb-999" not in text
    assert hallucinated == ["kb-999"]


# ------------------------------------------------------------ citation build


def test_citations_are_built_from_metadata_not_model_text() -> None:
    """CLAUDE.md rule 4. The model selects a row; it never supplies the details."""
    chunks = [chunk("kb-008")]

    citations = build_citations(chunks, ["kb-008"])

    assert len(citations) == 1
    assert citations[0].source_url == "https://example.invalid/kb-008"
    assert citations[0].as_of == "2026-04-01"
    assert citations[0].confidence == "confirmed"


def test_build_citations_refuses_an_id_it_was_not_given(caplog) -> None:
    with caplog.at_level(logging.WARNING):
        citations = build_citations([chunk("kb-008")], ["kb-008", "kb-999"])

    assert [c.kb_id for c in citations] == ["kb-008"]
    assert "hallucinated_citation" in caplog.text


# ------------------------------------------------------------------ context


def test_context_labels_each_chunk_with_its_id_and_date() -> None:
    context = format_context([chunk("kb-008"), chunk("kb-007")])

    assert "[kb-008]" in context
    assert "[kb-007]" in context
    assert "2026-04-01" in context


# ------------------------------------------------- end-to-end over the chain


@pytest.fixture
def indexed(sample_csv, tmp_settings, fake_embeddings):
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )
    return tmp_settings


def test_good_answer_is_grounded(indexed, fake_embeddings) -> None:
    model = StubModel("A placeholder fare applies [kb-008].")

    result = answer_question(
        "ferry ticket price",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.grounded is True
    assert result.refusal is False
    assert "kb-008" in result.cited_ids
    assert result.hallucinated_citations == []
    assert result.citations[0].source_url.startswith("https://example.invalid/")


def test_hallucinated_citation_marks_the_answer_ungrounded(
    indexed, fake_embeddings, caplog
) -> None:
    model = StubModel("Ferries sail hourly [kb-777].")

    with caplog.at_level(logging.WARNING):
        result = answer_question(
            "ferry ticket price",
            chat_model=model,
            embeddings=fake_embeddings,
            settings=indexed,
        )

    assert result.grounded is False
    assert result.hallucinated_citations == ["kb-777"]
    assert "[kb-777]" not in result.answer
    assert "hallucinated_citation" in caplog.text
    assert all(c.kb_id != "kb-777" for c in result.citations)


def test_uncited_answer_is_not_grounded(indexed, fake_embeddings) -> None:
    """Silence is not evidence — an answer with no citation is not trusted."""
    model = StubModel("Ferries sail twice a day.")

    result = answer_question(
        "ferry ticket price",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.grounded is False
    assert result.citations == []


def test_low_confidence_never_calls_the_model(indexed, fake_embeddings) -> None:
    """Structurally incapable of hallucinating: nothing is generated."""
    result = answer_question(
        "which beach should I visit this afternoon?",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.refusal is True
    assert result.grounded is False
    assert result.answer == NO_ANSWER_MESSAGE
    assert ESCALATION_BLOCK in result.answer
    assert result.citations == []
    assert result.model is None


def test_short_circuit_threshold_is_the_configured_one(indexed, fake_embeddings) -> None:
    forgiving = indexed.model_copy(update={"RETRIEVAL_MIN_SCORE": 0.0})
    model = StubModel("Placeholder [kb-008].")

    result = answer_question(
        "totally unrelated gibberish",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=forgiving,
    )

    assert result.refusal is False, "a zero floor must let everything through to the model"


def test_context_reaches_the_model_with_real_ids(indexed, fake_embeddings) -> None:
    model = StubModel("Placeholder [kb-008].")

    answer_question(
        "ferry ticket price",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
    )

    system_prompt = model.calls[0][0].content
    assert "CONTEXT:" in system_prompt
    assert "[kb-" in system_prompt
    assert "SCASPA" in system_prompt


def test_todays_date_is_injected(indexed, fake_embeddings) -> None:
    from datetime import date

    model = StubModel("Placeholder [kb-008].")

    answer_question(
        "ferry ticket price",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
        today=date(2026, 8, 4),
    )

    assert "2026-08-04" in model.calls[0][0].content


# ------------------------------------------------- rule 10: verbatim figures


def test_figure_present_in_a_chunk_is_accepted() -> None:
    chunks = [chunk("kb-008", text="Answer: Placeholder fare is XCD 44.44 at 04:04.")]

    assert find_unverified_figures("The fare is XCD 44.44 [kb-008].", chunks) == []


def test_rounded_fee_is_caught() -> None:
    """A valid citation proves the row exists, not that the figure came from it."""
    chunks = [chunk("kb-008", text="Answer: Placeholder fare is XCD 44.44.")]

    assert find_unverified_figures("The fare is about XCD 44 [kb-008].", chunks) == ["XCD 44"]


def test_invented_fee_is_caught() -> None:
    chunks = [chunk("kb-008", text="Answer: Placeholder fare is XCD 44.44.")]

    assert find_unverified_figures("You will owe US$50 [kb-008].", chunks) == ["US$50"]


def test_reformatted_time_is_caught() -> None:
    chunks = [chunk("kb-007", text="Answer: Placeholder departures at 04:04 and 16:16.")]

    assert find_unverified_figures("It leaves at 4:04 [kb-007].", chunks) == ["4:04"]


def test_unverified_figure_marks_the_answer_ungrounded(indexed, fake_embeddings, caplog) -> None:
    """The pressure attack: the model capitulates and invents a new fare."""
    model = StubModel("You are right, the fare is actually XCD 60.00 [kb-008].")

    with caplog.at_level(logging.WARNING):
        result = answer_question(
            "ferry ticket price",
            chat_model=model,
            embeddings=fake_embeddings,
            settings=indexed,
        )

    assert result.unverified_figures == ["XCD 60.00"]
    assert result.grounded is False
    assert "unverified_figure" in caplog.text


# --------------------------------------------------------- the refusal gate


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("what's the radio frequency for berthing?", "vessel_or_aircraft_operations"),
        ("which VHF channel should I use?", "vessel_or_aircraft_operations"),
        ("give me berthing instructions", "vessel_or_aircraft_operations"),
        ("where is my container?", "personal_record"),
        ("can you track my shipment", "personal_record"),
        ("what is the status of my booking", "personal_record"),
    ],
)
def test_dangerous_questions_hit_the_refusal_gate(question: str, expected: str) -> None:
    assert match_refusal_category(question) == expected


@pytest.mark.parametrize(
    "question",
    [
        "what documents are needed to clear cargo?",
        "how much is a ferry ticket?",
        "when is the cargo gate open?",
        "how early should I arrive at the airport?",
        "what does parking cost?",
    ],
)
def test_legitimate_questions_are_not_over_refused(question: str) -> None:
    """kb-006 answers the customs-documents question; the gate must not eat it."""
    assert match_refusal_category(question) is None


def test_refusal_gate_never_calls_the_model(indexed, fake_embeddings) -> None:
    result = answer_question(
        "what's the radio frequency for berthing?",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.refusal is True
    assert result.refusal_category == "vessel_or_aircraft_operations"
    assert result.answer == REFUSAL_MESSAGE
    assert ESCALATION_BLOCK in result.answer
    assert result.model is None


def test_refusal_gate_fires_even_when_retrieval_is_strong(indexed, fake_embeddings) -> None:
    """Safety refusals must not depend on a retrieval score."""
    forgiving = indexed.model_copy(update={"RETRIEVAL_MIN_SCORE": 0.0})

    result = answer_question(
        "where is my cargo container?",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=forgiving,
    )

    assert result.refusal is True


def test_only_confirmed_rows_can_ever_be_cited(indexed, fake_embeddings) -> None:
    """kb-003 and kb-009 are withheld at index time, so they cannot be retrieved."""
    model = StubModel("Placeholder [kb-003] [kb-009].")

    result = answer_question(
        "ferry luggage allowance",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert "kb-003" not in [c.kb_id for c in result.citations]
    assert "kb-009" not in [c.kb_id for c in result.citations]
    assert result.grounded is False
