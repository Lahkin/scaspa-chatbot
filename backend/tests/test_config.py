"""Settings tests. No network, no API key required."""

from app.config import Settings


def test_allowed_origins_parses_comma_separated_list() -> None:
    settings = Settings(ALLOWED_ORIGINS="http://a.test, http://b.test ,")

    assert settings.allowed_origins_list == ["http://a.test", "http://b.test"]


def test_payment_portal_is_blocklisted_by_default() -> None:
    """pay.scaspa.com is a live payment portal — CLAUDE.md rule 3."""
    settings = Settings(_env_file=None)

    assert "pay.scaspa.com" in settings.scraper_blocklist_set


def test_defaults_match_the_documented_contract() -> None:
    # _env_file=None so a developer's local .env cannot change the assertion.
    settings = Settings(_env_file=None)

    assert settings.CHAT_TEMPERATURE == 0.0
    assert settings.MAX_OUTPUT_TOKENS == 700
    assert settings.AGENT_MAX_TOOL_CALLS == 6
    assert settings.RETRIEVAL_TOP_K == 5
    assert settings.RETRIEVAL_FETCH_K == 20
    assert settings.RETRIEVAL_MIN_SCORE == 0.30
