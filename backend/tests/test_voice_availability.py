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
from app.voice import availability, provider


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


class TestTheElevenLabsProbe:
    """A second provider means a second, differently-shaped question.

    OpenAI fails on entitlement, which the model list answers exactly.
    ElevenLabs fails on reachability *or* on nobody having chosen a voice — and
    the second is a real HALF-available state that the OpenAI path has no
    equivalent of.
    """

    @staticmethod
    def _el(**overrides):  # noqa: ANN003, ANN205
        defaults = {"ELEVENLABS_API_KEY": "xi-test", "VOICE_PROVIDER": "elevenlabs"}
        return Settings(_env_file=None, **{**defaults, **overrides})

    @staticmethod
    def _reachable():  # noqa: ANN205
        return patch.object(availability, "elevenlabs_reachable", lambda _s: None)

    def test_a_chosen_voice_makes_both_halves_available(self) -> None:
        with (
            self._reachable(),
            patch.object(availability, "elevenlabs_voices", lambda _s: [("voice-42", "Marin")]),
        ):
            result = availability.voice_availability(self._el(ELEVENLABS_VOICE_ID="voice-42"))

        assert (result.stt, result.tts, result.checked) == (True, True, True)
        assert result.provider == "elevenlabs"
        # Names the voice, because "speaking as 'Marin'" is what tells an
        # operator the deployment sounds the way it is supposed to.
        assert "Marin" in result.detail

    def test_no_voice_chosen_is_transcription_only(self) -> None:
        """The state this account is in until somebody picks a voice.

        Reported honestly rather than as a total failure: the microphone works,
        the speak-aloud control does not, and the detail says which command
        lists the options.
        """
        with (
            self._reachable(),
            patch.object(availability, "elevenlabs_voices", lambda _s: [("voice-42", "Marin")]),
        ):
            result = availability.voice_availability(self._el(ELEVENLABS_VOICE_ID=""))

        assert result.stt is True, "transcription needs no voice"
        assert result.tts is False
        assert result.checked is True
        assert "voice_smoke.py --voices" in result.detail

    def test_a_voice_id_that_is_not_on_the_account_is_caught(self) -> None:
        # A typo or a copied id from another account. Better found by a probe
        # than by a 404 in front of somebody waiting to hear an answer.
        with (
            self._reachable(),
            patch.object(availability, "elevenlabs_voices", lambda _s: [("voice-42", "Marin")]),
        ):
            result = availability.voice_availability(self._el(ELEVENLABS_VOICE_ID="voice-99"))

        assert result.tts is False
        assert "voice-99" in result.detail

    def test_an_unreachable_account_claims_nothing(self) -> None:
        def explode(_s):  # noqa: ANN001, ANN202
            raise RuntimeError("connection reset")

        with patch.object(availability, "elevenlabs_reachable", explode):
            result = availability.voice_availability(self._el(ELEVENLABS_VOICE_ID="voice-42"))

        assert (result.stt, result.tts) == (True, True)
        assert result.checked is False, "an unreachable provider is not a finding"

    def test_a_key_that_may_not_list_voices_still_speaks(self) -> None:
        """── THE BUG THIS PINS ────────────────────────────────────────────────

        The first probe listed voices as its reachability check. The key
        supplied for this project returns 200 for text-to-speech and
        speech-to-text and 401 for `voices_read` — least privilege done
        properly, not a misconfiguration.

        That probe reported "could not reach ElevenLabs" and would have hidden
        two working controls, which is exactly the failure this module exists to
        prevent, arriving from the one direction it did not anticipate.

        Reachability is now `/v1/models`; listing voices is an optional extra
        that verifies the id, and being refused it is not a finding.
        """

        def refuse(_s):  # noqa: ANN001, ANN202
            raise provider.VoicesNotPermitted("no voices_read")

        with self._reachable(), patch.object(availability, "elevenlabs_voices", refuse):
            result = availability.voice_availability(self._el(ELEVENLABS_VOICE_ID="voice-42"))

        assert result.tts is True, "synthesis does not need voices_read"
        assert result.stt is True
        assert result.checked is True
        assert "voices_read" in result.detail
