"""Answer-chain tests — the safety-critical ones.

None of these need an OpenAI key. The chat model is a stub whose output we
control, which is exactly what lets us assert that the *backend* refuses to
trust it.
"""

import logging
import re

import pytest

from app.agent.prompts import (
    CLOSING_MESSAGE,
    ESCALATION_BLOCK,
    GREETING_MESSAGE,
    NO_ANSWER_MESSAGE,
    REFUSAL_MESSAGE,
)
from app.rag.answer import (
    answer_question,
    build_citations,
    extract_citations,
    find_unverified_figures,
    format_context,
    is_conversational_opener,
    match_refusal_category,
    verify_citations,
)
from app.rag.ingest import build_kb_index
from app.rag.retriever import RetrievedChunk
from tests.scripted_model import ExplodingModel, searches_then_says

# --------------------------------------------------------------------- stubs


# The agent needs a real BaseChatModel (create_agent calls bind_tools), so the
# doubles live in tests/scripted_model.py. StubModel keeps the old name and the
# old intent: produce this answer, then let the backend verify it.
#
# The search query is "ferry" deliberately. The fake embeddings put every
# document on a topic axis, and an off-axis query leaves all distances tied at
# 1.0 — so which rows come back is decided by Chroma's arbitrary tie-break, and
# the test flakes. A query on a real axis makes retrieval deterministic.
def StubModel(reply: str):  # noqa: N802 — kept as a name for readability
    return searches_then_says(reply, query="ferry")


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


def test_context_fences_each_chunk_as_untrusted_data() -> None:
    """Retrieved content is DATA, not instruction, and the fence says so.

    Scraped web text ends up in here too, and anyone who can edit a web page
    could otherwise write an instruction into the prompt.
    """
    context = format_context([chunk("kb-008"), chunk("kb-007")])

    assert '<<<SOURCE id="kb-008"' in context
    assert '<<<END SOURCE id="kb-008">>>' in context
    assert '<<<SOURCE id="kb-007"' in context
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
    assert "SCASPA" in system_prompt
    assert "search_scaspa_knowledge" in system_prompt, "the agent is told to search first"


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
    """A time whose **value** changed is caught. Notation alone is not a change.

    This assertion moved, deliberately, and the reason is worth stating.

    It used to require `4:04` to be flagged against a row reading `04:04` — a
    dropped leading zero, which is the same instant written two ways. That was
    inconsistent with the principle the grounding layer states in its own
    comments: *"`12,407,059` and `12407059` are the same number; refusing one
    because the row spells it the other way would suppress correct answers,
    which is its own failure"*, and, explicitly, *"Drop a leading zero on a
    time: `04:04` vs `4:04`"*. That layer only implemented the equivalence in
    one direction, so the two checks disagreed about the same pair.

    `app.rag.figures` settles it: notation is normalised, value never is. So the
    leading zero passes, and every rewrite that moves the actual time — a wrong
    hour, a lost meridiem, a loose rounding — still fails, as asserted below.
    """
    chunks = [chunk("kb-007", text="Answer: Placeholder departures at 04:04 and 16:16.")]

    # Same instant, one leading zero apart.
    assert find_unverified_figures("It leaves at 4:04 [kb-007].", chunks) == []

    # A different instant, however plausibly written.
    assert find_unverified_figures("It leaves at 4:40 [kb-007].", chunks) == ["4:40"]
    assert find_unverified_figures("It leaves at 4:04 pm [kb-007].", chunks) == ["4:04 pm"]
    assert find_unverified_figures("It leaves around 5 am [kb-007].", chunks) == ["5 am"]


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


# ── Greetings ────────────────────────────────────────────────────────────────
#
# "hi" is the first thing anyone types. It used to reach retrieval, embed to a
# best score of ~0.12, and come back as NO_ANSWER_MESSAGE — "I do not have that
# in SCASPA's verified information" — followed by a telephone number.


@pytest.mark.parametrize(
    "message",
    [
        "hi",
        "Hi!",
        "  hello  ",
        "hey there",
        "Good morning",
        "good afternoon!",
        "hiya",
        "how are you?",
        "thanks",
        "Thank you!",
        "cheers",
        "bye",
    ],
)
def test_a_pleasantry_is_recognised(message: str) -> None:
    assert is_conversational_opener(message) is True


@pytest.mark.parametrize(
    "message",
    [
        # The one that matters: politeness in front of a real question must not
        # swallow the question. A greeting gate that does this stops the product
        # answering, which is far worse than the defect it was added to fix.
        "hi, how much is a 40ft container?",
        "hello, where do cruise ships dock?",
        "good morning, what time is the last ferry?",
        "thanks, but where is the ferry terminal?",
        # Ordinary questions, no pleasantry at all.
        "where do cruise ships dock in St. Kitts?",
        "what are SCASPA's opening hours?",
        # Words that merely start with a greeting's letters.
        "high tide times",
        "hello kitty cargo shipment",
        "is there a helipad?",
    ],
)
def test_a_question_is_never_a_pleasantry(message: str) -> None:
    assert is_conversational_opener(message) is False


def test_a_greeting_never_reaches_retrieval(indexed, fake_embeddings) -> None:
    """The point of the gate: no model call, no retrieval, no fabrication.

    `ExplodingModel` raises if it is called at all, so this also proves the
    greeting cannot be talked into saying something — there is no generation
    behind it to influence.
    """
    result = answer_question(
        "hi",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.answer == GREETING_MESSAGE
    # Not a refusal. Filing "hello" as a refusal makes the refusal rate
    # meaningless and tells the client the assistant declined to help.
    assert result.refusal is False
    # Grounded, vacuously — no id and no figure, so every one of them traces.
    # False here made `MessageBubble` render `UngroundedNotice`: an amber
    # "I could not fully verify this" under a message that made no claim, on
    # the interaction demo-day.md opens with. See `_greeting_result`.
    assert result.grounded is True
    assert result.citations == []
    assert result.retrieved == []
    assert result.model is None


def test_the_greeting_states_no_fact_anyone_could_act_on(indexed, fake_embeddings) -> None:
    """It names what it covers and cites nothing, because it claims nothing."""
    result = answer_question(
        "hello",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert re.search(r"\d{1,2}:\d{2}", result.answer) is None, "no clock time"
    assert re.search(r"(XCD|EC\$|US\$|\$)\s*\d", result.answer) is None, "no money"
    # No escalation block: ending "hello" with a telephone number reads as
    # being shown the door.
    assert ESCALATION_BLOCK not in result.answer
    assert "465-8121" not in result.answer, "no telephone number in either form"
    assert "465 8121" not in result.answer


def test_a_polite_question_is_still_answered_normally(indexed, fake_embeddings) -> None:
    """The regression that would matter most, driven end to end.

    If the gate ever swallowed this, every politely-phrased question would
    return a greeting and the product would look like it had stopped working.
    """
    model = StubModel("Ferry luggage is set by the operator [kb-001].")

    result = answer_question(
        "hi, what is the ferry luggage allowance?",
        chat_model=model,
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.answer != GREETING_MESSAGE
    assert result.retrieved, "a real question must still reach retrieval"


def test_a_closing_is_answered_as_a_closing(indexed, fake_embeddings) -> None:
    """ "thanks" is the second thing people type, and "Hello." is the wrong reply."""
    result = answer_question(
        "thanks!",
        chat_model=ExplodingModel(),
        embeddings=fake_embeddings,
        settings=indexed,
    )

    assert result.answer == CLOSING_MESSAGE
    assert result.answer != GREETING_MESSAGE
    assert result.refusal is False
    # Same reasoning as the greeting: nothing to verify, so nothing is withdrawn.
    assert result.grounded is True
    assert ESCALATION_BLOCK not in result.answer
