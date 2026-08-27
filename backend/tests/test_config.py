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


def test_env_file_none_actually_isolates() -> None:
    """`Settings(_env_file=None)` must read no `.env`, and for a while it did not.

    ── WHY THIS IS WORTH A TEST OF ITS OWN ──────────────────────────────────────

    Every test in this suite that builds `Settings(_env_file=None, ...)` is
    saying "ignore this developer's configuration", and `tests/conftest.py`
    carries a comment promising exactly that. The two `_EnvFile` sources read
    their files regardless, so the promise was empty.

    It stayed invisible for months because no test asserted on a value a
    developer happened to have set locally. It surfaced the day an
    `ELEVENLABS_API_KEY` appeared in a real `.env`, because that one flips which
    speech provider `auto` resolves to — eight tests began failing on a machine
    where the key existed and would still have passed in CI, which is the worst
    shape a test failure can take.

    Asserted on a variable that is only ever set in a real `.env` and never
    defaulted, so a pass here means the file genuinely was not read.
    """
    isolated = Settings(_env_file=None)

    assert isolated.OPENAI_API_KEY == "", "a developer's real key reached an isolated Settings"
    assert isolated.ELEVENLABS_API_KEY == ""


def test_the_real_settings_still_read_dotenv() -> None:
    """The other half, and the more expensive one to get wrong.

    Isolating too eagerly would stop production reading `.env` at all and take
    the API key with it — a failure that shows up as every answer degrading to
    "I do not have that", with nothing pointing at configuration.
    """
    from app.config import _dotenv_disabled

    class _NoAttr:
        pass

    # Anything unexpected must read as "not disabled", so the files are read.
    assert _dotenv_disabled(_NoAttr()) is False
