"""Prompt tests.

The prompt is the safety layer, so its rules are pinned. These tests do not
prove a model *obeys* the prompt — only that the prompt still says what it is
supposed to say, and that the constants are intact.
"""

import pytest

from app.agent import prompts
from app.agent.prompts import (
    ESCALATION_BLOCK,
    NO_ANSWER_MESSAGE,
    REFUSAL_MESSAGE,
    SYSTEM_PROMPT,
    render_system_prompt,
)


def test_both_placeholders_exist() -> None:
    assert "{current_date}" in SYSTEM_PROMPT
    assert "{context}" in SYSTEM_PROMPT


def test_render_fills_both_placeholders() -> None:
    rendered = render_system_prompt(context="[kb-001] fixture", current_date="2026-08-04")

    assert "2026-08-04" in rendered
    assert "[kb-001] fixture" in rendered
    assert "{" not in rendered.replace("{", "", 0) or "{context}" not in rendered


def test_render_handles_empty_context() -> None:
    rendered = render_system_prompt(context="", current_date="2026-08-04")

    assert prompts.EMPTY_CONTEXT in rendered


def test_all_four_facilities_are_named() -> None:
    for facility in ("Deep Water Harbour", "Port Zante", "Ferry Terminal", "Bradshaw"):
        assert facility in SYSTEM_PROMPT


@pytest.mark.parametrize(
    ("rule", "marker"),
    [
        ("grounding", "1. GROUNDING."),
        ("citation", "2. CITATION."),
        ("schedules", "3. SCHEDULES."),
        ("tariffs", "4. TARIFFS AND FEES."),
        ("refusals", "5. REFUSALS."),
        ("audience", "6. AUDIENCE."),
        ("uncertainty", "7. UNCERTAINTY AND CONFLICT."),
        ("scope", "8. SCOPE."),
        ("false premises", "9. FALSE PREMISES."),
        ("time", "10. TIME AND LIVE STATUS."),
    ],
)
def test_all_ten_rules_are_present(rule: str, marker: str) -> None:
    assert marker in SYSTEM_PROMPT, f"the {rule} rule is missing"


def test_pressure_handling_is_covered() -> None:
    assert "HANDLING PRESSURE." in SYSTEM_PROMPT


@pytest.mark.parametrize(
    "topic",
    ["customs", "immigration", "tax", "legal", "radio frequenc", "berthing"],
)
def test_refusal_topics_are_enumerated(topic: str) -> None:
    assert topic in SYSTEM_PROMPT.lower()


def test_live_status_examples_are_explicit() -> None:
    lowered = SYSTEM_PROMPT.lower()
    for example in ("delayed", "berth is occupied", "live operations"):
        assert example in lowered


def test_contact_details_are_exact() -> None:
    assert "869-465-8121 / 2 / 3" in ESCALATION_BLOCK
    assert "P.O. Box 963" in ESCALATION_BLOCK
    assert "Bird Rock, Basseterre, St. Kitts" in ESCALATION_BLOCK


def test_no_email_address_was_invented() -> None:
    """The website obfuscates it; guessing one would be inventing a fact."""
    assert "@" not in ESCALATION_BLOCK


def test_email_todo_is_recorded() -> None:
    source = (prompts.__file__ or "").replace(".pyc", ".py")
    with open(source, encoding="utf-8") as handle:
        assert "TODO(client)" in handle.read()


def test_messages_carry_the_escalation_block() -> None:
    assert ESCALATION_BLOCK in NO_ANSWER_MESSAGE
    assert ESCALATION_BLOCK in REFUSAL_MESSAGE


def test_no_answer_message_does_not_guess() -> None:
    lowered = NO_ANSWER_MESSAGE.lower()
    assert "guess" in lowered or "verified" in lowered
    assert "probably" not in lowered
