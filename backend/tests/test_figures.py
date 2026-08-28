"""Rule 10 has to hold in every language the assistant answers in.

Nothing in `app/agent/prompts.py` pins the answer's language, so the model
mirrors the question's. These tests exist because both enforcement layers were
written against English and silently stopped enforcing anything when it did.

The bug that prompted them, measured against the running service:

    kb-016 (English)  "8:00 am to 4:00 pm"
    French answer     "de 8 h a 16 h"
    reported          grounded: true, unverified_figures: none

The identical rewrite **is** caught in English (`16:00` is flagged), so this was
not a gap in the rule — it was the rule not being applied at all.
"""

from decimal import Decimal

import pytest

from app.rag.answer import find_unverified_figures
from app.rag.figures import clock_forms, equivalent_forms, parse_clock, parse_money
from app.rag.grounding import check_numbers
from app.rag.retriever import RetrievedChunk

# The real row, quoted exactly. The French answer above cited this one.
KB_016 = (
    "Seaport offices are open Monday to Friday, 8:00 am to 4:00 pm. "
    "The airport operates daily from 6:00 am to 9:00 pm."
)
KB_TARIFF = "The container handling charge is XCD 44.44 per container."


@pytest.fixture
def chunks() -> list[RetrievedChunk]:
    return [
        RetrievedChunk(id="kb-016", text=KB_016, score=0.9, metadata={}),
        RetrievedChunk(id="kb-004", text=KB_TARIFF, score=0.9, metadata={}),
    ]


# ── The canonicaliser ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("written", "minutes"),
    [
        ("4:00 pm", 960),
        ("16:00", 960),
        ("16 h", 960),  # French and Spanish convention
        ("16h", 960),
        ("16h30", 990),
        ("8 h", 480),
        ("4pm", 960),
        ("04:04", 244),
    ],
)
def test_one_instant_is_read_the_same_however_it_is_written(written: str, minutes: int) -> None:
    assert parse_clock(written) == minutes


@pytest.mark.parametrize("not_a_clock", ["24h", "25:00", "99 h", "8:99", "per ft per 24h", ""])
def test_what_is_not_a_clock_is_not_guessed_at(not_a_clock: str) -> None:
    """`24h` is a tariff basis, not midnight.

    This is the guard that keeps a widened net from flagging correct English
    answers: an unparsed value returns None and keeps its verbatim treatment.
    """
    assert parse_clock(not_a_clock) is None


def test_the_localised_hour_and_the_twelve_hour_clock_are_the_same_figure() -> None:
    assert "4:00 pm" in clock_forms(960)
    assert "16 h" in clock_forms(960)
    assert "16:00" in clock_forms(960)
    # And the equivalence runs in both directions, which is what the callers need.
    assert "4:00 pm" in equivalent_forms("16 h")
    assert "16 h" in equivalent_forms("4:00 pm")


@pytest.mark.parametrize(
    ("written", "expected"),
    [
        ("XCD 44.44", ("XCD", Decimal("44.44"))),
        ("XCD 44,44", ("XCD", Decimal("44.44"))),  # Spanish / French decimal comma
        ("US$50", ("USD", Decimal("50"))),
        ("12,407", ("", Decimal("12407"))),  # comma grouping thousands, not a decimal
    ],
)
def test_an_amount_is_read_the_same_in_either_decimal_convention(
    written: str, expected: tuple[str, Decimal]
) -> None:
    assert parse_money(written) == expected


def test_a_changed_value_is_never_equivalent_to_the_original() -> None:
    """The line this module must not cross.

    Normalising notation is the whole point; normalising *value* would delete
    the guarantee. Each of these is a rewrite rule 10 exists to catch.
    """
    assert "4:00 pm" not in equivalent_forms("17 h")  # wrong hour
    assert "XCD 44.44" not in equivalent_forms("XCD 44")  # rounded down
    assert "04:04" not in equivalent_forms("4 am")  # reformatted loosely


# ── Layer 1: the flag ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("language", "answer"),
    [
        ("English", "Seaport offices are open 8:00 am to 4:00 pm. [kb-016]"),
        ("French", "Les bureaux sont ouverts de 8 h a 16 h. [kb-016]"),
        ("Spanish", "Las oficinas abren de 8:00 a 16:00. [kb-016]"),
    ],
)
def test_a_faithful_answer_is_not_flagged_in_any_language(
    language: str, answer: str, chunks: list[RetrievedChunk]
) -> None:
    assert find_unverified_figures(answer, chunks) == [], language


@pytest.mark.parametrize(
    ("language", "answer", "offender"),
    [
        ("English", "Open 8:00 am to 5:00 pm. [kb-016]", "5:00 pm"),
        ("French", "Ouvert de 8 h a 17 h. [kb-016]", "17 h"),
        ("Spanish", "Abren de 8:00 a 17:00. [kb-016]", "17:00"),
    ],
)
def test_a_wrong_hour_is_caught_in_any_language(
    language: str, answer: str, offender: str, chunks: list[RetrievedChunk]
) -> None:
    """The regression test for the bug.

    Before this, the French row returned `[]` — not because the hour was right,
    but because `17 h` matched no pattern and was never looked at.
    """
    assert find_unverified_figures(answer, chunks) == [offender], language


def test_a_twelve_hour_error_is_caught_in_english(chunks: list[RetrievedChunk]) -> None:
    """Found while writing the tests above, and it was never about language.

    `TIME_PATTERN` listed the bare `HH:MM` branch first, so alternation matched
    "4:00" in "4:00 pm" and left the meridiem behind. The check then compared
    "4:00" against a row reading "4:00 pm" — and against one reading "4:00 am"
    just as happily. An answer that moved a sailing by twelve hours passed.
    """
    ferry = [
        RetrievedChunk(id="kb-007", text="The ferry departs at 5:00 am.", score=0.9, metadata={})
    ]
    assert find_unverified_figures("Departs at 5:00 am. [kb-007]", ferry) == []
    assert find_unverified_figures("Departs at 5:00 pm. [kb-007]", ferry) == ["5:00 pm"]
    assert [f.value for f in check_numbers("Departs at 5:00 pm. [kb-007]", ferry).ungrounded] == [
        "5:00 pm"
    ]


def test_a_correct_amount_in_comma_convention_is_no_longer_a_false_alarm(
    chunks: list[RetrievedChunk],
) -> None:
    """The other half of the bug, and the quieter one.

    `XCD 44,44` is `XCD 44.44`. It was extracted, compared verbatim against the
    English row, and reported unverifiable — training a reader to ignore the
    flag, which is the failure mode `find_unverified_figures` warns about.
    """
    assert find_unverified_figures("La tarifa es XCD 44,44. [kb-004]", chunks) == []
    assert find_unverified_figures("La tarifa es XCD 44,45. [kb-004]", chunks) == ["XCD 44,45"]


def test_a_tariff_basis_is_not_mistaken_for_a_time(chunks: list[RetrievedChunk]) -> None:
    """`per ft per 24h` is a unit, and widening the net must not catch it."""
    assert find_unverified_figures("Dockage is charged per ft per 24h. [kb-004]", chunks) == []


# ── Layer 2: the gate that replaces the answer ───────────────────────────────


def test_the_grounding_gate_now_sees_a_localised_time_at_all(
    chunks: list[RetrievedChunk],
) -> None:
    """`checked` is the assertion that matters here.

    A figure the pattern cannot see is not merely unflagged — it is counted as
    nothing checked, and the answer ships reported as grounded. This was 0.
    """
    result = check_numbers("Les bureaux sont ouverts de 8 h a 16 h. [kb-016]", chunks)
    assert result.checked == 2
    assert result.ungrounded == []


def test_the_grounding_gate_replaces_a_localised_answer_with_a_wrong_hour(
    chunks: list[RetrievedChunk],
) -> None:
    result = check_numbers("Les bureaux sont ouverts de 8 h a 17 h. [kb-016]", chunks)
    assert [f.value for f in result.ungrounded] == ["17 h"]


def test_the_grounding_gate_leaves_a_unit_alone(chunks: list[RetrievedChunk]) -> None:
    result = check_numbers("Dockage is charged per ft per 24h. [kb-004]", chunks)
    assert result.checked == 0
    assert result.ungrounded == []
