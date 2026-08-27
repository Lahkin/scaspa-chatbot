"""Two speech providers, and the rules that decide between them.

ElevenLabs was supplied because this project's OpenAI key has no speech-model
entitlement at all (decisions.md 0047). A second provider is a place for two
kinds of mistake — picking the wrong one silently, and letting the second copy
of the code drift from the first — so most of this is about those.
"""

import httpx
import pytest

from app.config import Settings
from app.voice import provider


def _settings(**overrides) -> Settings:  # noqa: ANN003
    defaults = {"ELEVENLABS_API_KEY": "", "VOICE_PROVIDER": "auto"}
    return Settings(_env_file=None, **{**defaults, **overrides})


class TestWhichProviderAnswers:
    def test_auto_picks_elevenlabs_when_its_key_is_present(self) -> None:
        """One key is the whole of the configuration.

        The shape least likely to be got wrong: somebody pastes the key they
        were given and voice works, without also having to know that a second
        setting exists.
        """
        assert provider.resolve_provider(_settings(ELEVENLABS_API_KEY="xi-test")) == "elevenlabs"

    def test_auto_falls_back_to_openai_with_no_elevenlabs_key(self) -> None:
        assert provider.resolve_provider(_settings()) == "openai"

    @pytest.mark.parametrize(
        ("choice", "expected"),
        [("openai", "openai"), ("elevenlabs", "elevenlabs"), ("OpenAI", "openai")],
    )
    def test_an_explicit_choice_always_wins(self, choice: str, expected: str) -> None:
        # Including an explicit `openai` on a deployment that also holds an
        # ElevenLabs key — otherwise "auto" would be impossible to override and
        # the setting would be a lie.
        settings = _settings(VOICE_PROVIDER=choice, ELEVENLABS_API_KEY="xi-test")
        assert provider.resolve_provider(settings) == expected

    def test_an_unrecognised_value_does_not_break_voice(self) -> None:
        # A typo in an env var must not take speech away; it falls to the same
        # rule as `auto`, which is the safe direction.
        settings = _settings(VOICE_PROVIDER="elevnlabs", ELEVENLABS_API_KEY="xi-test")
        assert provider.resolve_provider(settings) == "elevenlabs"


class TestSynthesis:
    def test_it_posts_the_sanitised_text_to_the_chosen_voice(self) -> None:
        """The voice id is in the PATH, and the model in the body.

        Getting those the wrong way round is a 404 that reads like an outage,
        so the request shape is worth pinning.
        """
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["key"] = request.headers.get("xi-api-key")
            seen["body"] = request.read().decode()
            return httpx.Response(200, content=b"ID3-audio-bytes")

        settings = _settings(
            ELEVENLABS_API_KEY="xi-test",
            ELEVENLABS_VOICE_ID="voice-42",
            ELEVENLABS_TTS_MODEL="eleven_multilingual_v2",
        )
        with _transport(handler):
            audio = provider.elevenlabs_synthesise("Call 869 465 8121.", settings)

        assert audio == b"ID3-audio-bytes"
        assert "/text-to-speech/voice-42" in seen["url"]
        assert "output_format=mp3_44100_128" in seen["url"]
        assert "eleven_multilingual_v2" in seen["body"]
        # The key travels in a header, never in the URL — a URL reaches logs,
        # proxies and error messages that a header does not.
        assert seen["key"] == "xi-test"
        assert "xi-test" not in seen["url"]

    def test_no_voice_chosen_is_a_configuration_fault_not_an_outage(self) -> None:
        """`ValueError`, so the caller does not report a provider failure.

        Nothing is wrong with ElevenLabs when no voice has been picked, and
        saying "voice is unavailable right now" would send somebody to look at
        a service that is working.
        """
        settings = _settings(ELEVENLABS_API_KEY="xi-test", ELEVENLABS_VOICE_ID="")
        with pytest.raises(ValueError, match="ELEVENLABS_VOICE_ID"):
            provider.elevenlabs_synthesise("Anything.", settings)


class TestTranscription:
    def test_it_returns_the_text_field(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert "/speech-to-text" in str(request.url)
            return httpx.Response(200, json={"text": " When is the ferry? ", "language_code": "en"})

        settings = _settings(ELEVENLABS_API_KEY="xi-test")
        with _transport(handler):
            text = provider.elevenlabs_transcribe(b"audio", "clip.webm", settings)

        # Unstripped here; `stt.py` owns the trimming, as it does for OpenAI.
        assert text == " When is the ferry? "

    def test_an_unexpected_shape_raises_rather_than_speaking_json(self) -> None:
        """A missing `text` field must not become the user's transcript.

        Falling back to the whole body would put `{"detail": ...}` into the
        composer as though the user had said it.
        """

        def handler(request: httpx.Request) -> httpx.Response:  # noqa: ARG001
            return httpx.Response(200, json={"detail": "something else entirely"})

        settings = _settings(ELEVENLABS_API_KEY="xi-test")
        with _transport(handler), pytest.raises(ValueError, match="no text field"):
            provider.elevenlabs_transcribe(b"audio", "clip.webm", settings)

    def test_the_audio_is_posted_and_never_written_anywhere(self, tmp_path) -> None:  # noqa: ANN001
        """The same guarantee the OpenAI path makes.

        `stt.py` hands bytes rather than a path precisely so that recorded audio
        cannot reach disk — `docs/privacy.md` says nothing here is stored.
        """
        before = set(tmp_path.iterdir())

        def handler(request: httpx.Request) -> httpx.Response:
            assert b"audio-bytes" in request.read()
            return httpx.Response(200, json={"text": "ok"})

        settings = _settings(ELEVENLABS_API_KEY="xi-test")
        with _transport(handler):
            provider.elevenlabs_transcribe(b"audio-bytes", "clip.webm", settings)

        assert set(tmp_path.iterdir()) == before


def _transport(handler):  # noqa: ANN001, ANN202
    """Swap the module's client for one backed by `handler`."""
    import contextlib

    real = provider._client

    @contextlib.contextmanager
    def patched():  # noqa: ANN202
        def build(settings: Settings) -> httpx.Client:
            return httpx.Client(
                base_url=provider.BASE_URL,
                transport=httpx.MockTransport(handler),
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            )

        provider._client = build
        try:
            yield
        finally:
            provider._client = real

    return patched()
