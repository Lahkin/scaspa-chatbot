"""Which service does speech, and the one call each of them takes.

## Why there are two

This project's OpenAI key has no speech-model entitlement — `/v1/models`
returns nine models and not one can transcribe or synthesise (decisions.md
0047). ElevenLabs was supplied instead, so voice needs a second provider rather
than a different OpenAI model id.

## What is deliberately NOT in here

Everything that makes voice usable stays where it was:

* the sanitisation in `tts.py` — markdown, citation markers, URLs, currency
  codes, and above all the telephone number, which read as a quantity is
  "eight hundred sixty-nine million…" and which ends every refusal this product
  gives;
* the on-disk cache, keyed on the sanitised text, so a rehearsed answer is
  synthesised once;
* the size-and-latency logging that never touches the audio or the transcript;
* the retry and error classification in `app/upstream.py`.

This module is only the provider call. A second provider must not mean a second
copy of the thinking, and the sanitiser is the most valuable code in the voice
path — it would be the first thing to drift.

## httpx rather than the ElevenLabs SDK

The project already depends on httpx, already has `call_with_retry` with the
backoff and classification the rest of the product uses, and needs exactly two
endpoints. An SDK would add a dependency to own two requests, and would bring
its own retry policy alongside the one already here.
"""

import logging
from typing import Literal

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

Provider = Literal["openai", "elevenlabs"]

BASE_URL = "https://api.elevenlabs.io/v1"

#: mp3, 44.1 kHz, 128 kbit/s. The client plays MP3 and the cache stores it, so
#: asking for anything else would mean transcoding to reach the same place.
OUTPUT_FORMAT = "mp3_44100_128"


def resolve_provider(settings: Settings | None = None) -> Provider:
    """Which provider this deployment uses, with `auto` settled.

    `auto` picks ElevenLabs when its key is present. One key is then the whole
    of the configuration, which is the shape least likely to be got wrong — and
    the resolved answer is reported by `/api/health`, so it is never a guess.

    An explicit value always wins, including an explicit `openai` on a
    deployment that also has an ElevenLabs key.
    """
    settings = settings or get_settings()
    choice = settings.VOICE_PROVIDER.strip().lower()

    if choice == "elevenlabs":
        return "elevenlabs"
    if choice == "openai":
        return "openai"
    return "elevenlabs" if settings.ELEVENLABS_API_KEY.strip() else "openai"


def _client(settings: Settings) -> httpx.Client:
    return httpx.Client(
        base_url=BASE_URL,
        timeout=settings.OPENAI_TIMEOUT_SECONDS,
        # The key travels in a header and appears in no URL, no log line and no
        # error message this module raises.
        headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
    )


def elevenlabs_synthesise(text: str, settings: Settings) -> bytes:
    """One text-to-speech call. Returns MP3 bytes.

    The text is already sanitised by the caller. Nothing here inspects or logs
    it — what is spoken is the caller's business and the caller's cache key.
    """
    if not settings.ELEVENLABS_VOICE_ID.strip():
        # Not an upstream failure, and it must not be reported as one: nothing
        # is wrong with ElevenLabs, a voice has simply not been chosen.
        raise ValueError(
            "ELEVENLABS_VOICE_ID is not set — run scripts/voice_smoke.py --voices "
            "to list the account's voices and pick one"
        )

    with _client(settings) as client:
        response = client.post(
            f"/text-to-speech/{settings.ELEVENLABS_VOICE_ID}",
            params={"output_format": OUTPUT_FORMAT},
            json={"text": text, "model_id": settings.ELEVENLABS_TTS_MODEL},
        )
        response.raise_for_status()
        return response.content


def elevenlabs_transcribe(data: bytes, filename: str, settings: Settings) -> str:
    """One speech-to-text call. Returns the transcript.

    The audio is posted from memory and never written to disk — the same
    guarantee the OpenAI path makes, and the reason `stt.py` hands bytes rather
    than a path.
    """
    with _client(settings) as client:
        response = client.post(
            "/speech-to-text",
            files={"file": (filename, data)},
            data={"model_id": settings.ELEVENLABS_STT_MODEL},
        )
        response.raise_for_status()
        body = response.json()

    # `text` is the documented field. Falling back to the whole body would put
    # a JSON dump in front of a user, so an unexpected shape is an error.
    text = body.get("text")
    if not isinstance(text, str):
        raise ValueError(f"speech-to-text returned no text field (keys: {sorted(body)})")
    return text


class VoicesNotPermitted(Exception):
    """This key may synthesise and transcribe, but may not list voices.

    ── NOT A FAILURE, AND THE DIFFERENCE MATTERS ────────────────────────────

    ElevenLabs keys carry granular permissions, and a well-made one is scoped
    to exactly what the application needs. The key supplied for this project
    returns 200 for text-to-speech and speech-to-text and 401 for `voices_read`
    and `user_read` — which is least privilege done properly, not a
    misconfiguration.

    So "cannot list voices" must never be reported as "cannot reach
    ElevenLabs". Treating it as an outage would hide two working controls on
    the strength of a permission the product does not require.
    """


def elevenlabs_reachable(settings: Settings) -> None:
    """Raise unless the key can authenticate. Requires no special permission.

    `/v1/models` is the check because it is the one endpoint this integration
    can rely on: it answers for any valid key, where `/v1/voices` and
    `/v1/user` each need a permission a least-privilege key will not have.
    """
    with _client(settings) as client:
        client.get("/models").raise_for_status()


def elevenlabs_voices(settings: Settings) -> list[tuple[str, str]]:
    """`(voice_id, name)` for the account, so a human can choose one.

    Raises `VoicesNotPermitted` when the key lacks `voices_read` — a state the
    caller must handle rather than report as a failure. See the class above.
    """
    with _client(settings) as client:
        response = client.get("/voices")
        if response.status_code in (401, 403):
            raise VoicesNotPermitted(
                "this key does not have the voices_read permission — read the voice id "
                "from the ElevenLabs dashboard, or add that permission to the key"
            )
        response.raise_for_status()
        voices = response.json().get("voices", [])
    return [(v.get("voice_id", ""), v.get("name", "")) for v in voices]
