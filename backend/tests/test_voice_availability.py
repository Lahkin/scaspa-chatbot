"""Whether this deployment can do voice, and what it does when it cannot know.

The product renders a microphone and a speak-aloud button by default. On this
project's OpenAI key neither can work — `/v1/models` returns nine models and not
one is a speech model, so every press made a round trip and came back "Voice is
unavailable right now".

A control that always fails is worse than an absent one. These assert that the
backend says so before the press, and — the half that is easier to get wrong —
that it stays quiet when it does not actually know.
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.config import Settings
from app.voice import availability


@pytest.fixture(autouse=True)
def _clear_cache():
    """The probe is cached for an hour, deliberately. Not across tests."""
    availability.reset_cache()
    yield
    availability.reset_cache()


def _settings(**overrides) -> Settings:  # noqa: ANN003
    # `_env_file=None` so a developer's real key cannot influence a test that is
    # entirely about what happens when there is or is not one.
    defaults = {
        "OPENAI_API_KEY": "sk-test-not-a-real-key",
        "OPENAI_TRANSCRIBE_MODEL": "gpt-transcribe",
        "OPENAI_TTS_MODEL": "gpt-4o-mini-tts",
    }
    return Settings(_env_file=None, **{**defaults, **overrides})


def _client_listing(*model_ids: str):  # noqa: ANN202
    """A stub OpenAI client whose `models.list()` returns these ids."""
    models = [SimpleNamespace(id=model_id) for model_id in model_ids]
    return SimpleNamespace(models=SimpleNamespace(list=lambda: models))


class TestWhatTheProbeFinds:
    def test_both_models_present_means_voice_works(self) -> None:
        with patch.object(
            availability, "OpenAI", lambda **_: _client_listing("gpt-transcribe", "gpt-4o-mini-tts")
        ):
            result = availability.voice_availability(_settings())

        assert (result.stt, result.tts, result.checked) == (True, True, True)

    def test_neither_present_is_reported_with_the_model_names(self) -> None:
        """The real state of this project, and the detail an operator acts on.

        Naming the models is the point: "voice is unavailable" sends somebody
        to read code, and "no access to gpt-transcribe, gpt-4o-mini-tts" sends
        them to the OpenAI project page, which is where the fix is.
        """
        with patch.object(availability, "OpenAI", lambda **_: _client_listing("gpt-4o")):
            result = availability.voice_availability(_settings())

        assert (result.stt, result.tts, result.checked) == (False, False, True)
        assert "gpt-transcribe" in result.detail
        assert "gpt-4o-mini-tts" in result.detail
        # It is an account change, not a deployment. Saying so stops the next
        # person redeploying twice before looking at the key.
        assert "entitlement" in result.detail

    def test_one_of_the_two_is_reported_independently(self) -> None:
        # Transcription and synthesis are separately entitled, so a deployment
        # can plausibly read answers aloud without accepting speech.
        with patch.object(availability, "OpenAI", lambda **_: _client_listing("gpt-4o-mini-tts")):
            result = availability.voice_availability(_settings())

        assert result.stt is False
        assert result.tts is True


class TestUnknownIsNotUnavailable:
    """The half that is easy to get wrong, and expensive.

    Hiding a working microphone because one request failed is a worse mistake
    than showing a broken one — and a far quieter one, because the control
    simply stops being there and nobody reports a button they never saw.
    """

    def test_a_listing_failure_stays_optimistic(self) -> None:
        def explode(**_):  # noqa: ANN003, ANN202
            raise RuntimeError("network is down")

        with patch.object(availability, "OpenAI", explode):
            result = availability.voice_availability(_settings())

        assert (result.stt, result.tts) == (True, True)
        assert result.checked is False, "an unreachable API is not a finding"

    def test_no_api_key_claims_nothing(self) -> None:
        result = availability.voice_availability(_settings(OPENAI_API_KEY=""))

        assert (result.stt, result.tts) == (True, True)
        assert result.checked is False


def test_the_probe_is_cached() -> None:
    """One listing per hour, not one per health request.

    `/api/health` is polled by every open tab. Listing models on each would turn
    a status check into upstream traffic proportional to how many people have
    the page open.
    """
    calls = {"n": 0}

    def counting(**_):  # noqa: ANN003, ANN202
        calls["n"] += 1
        return _client_listing("gpt-transcribe", "gpt-4o-mini-tts")

    with patch.object(availability, "OpenAI", counting):
        for _ in range(5):
            availability.voice_availability(_settings())

    assert calls["n"] == 1
