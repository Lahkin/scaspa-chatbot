"""Whether this deployment can do voice at all.

## The problem this exists to solve

`VITE_ENABLE_VOICE` defaults to true, so the microphone and the speak button
are rendered for every user. On this project's OpenAI key they cannot work:
`/v1/models` returns nine models and **not one of them is a speech model** — no
`whisper-1`, no `tts-1`, no `gpt-4o-mini-tts`, no `gpt-transcribe`. Asking for
any of them returns

    403 — Project `proj_…` does not have access to model `…`

So every press of the microphone made a round trip, waited, and produced "Voice
is unavailable right now". A control that always fails is worse than an absent
one: it is a promise the product cannot keep, offered to someone who may be
standing on a pier trying to use it.

A build-time flag cannot fix that, because the flag is set by whoever builds the
frontend and the entitlement belongs to whoever holds the API key. Only the
backend knows, so the backend says.

## Why the models list rather than a probe call

A synthesis or transcription probe costs money and takes seconds. Listing models
is free, fast, and definitive for exactly this failure — the 403 above is an
entitlement error, and an entitled model appears in the list. It cannot detect
every possible voice failure, and it is not meant to: a provider outage is a
different event with its own error path.

## Unknown is not unavailable

If the list cannot be fetched — no key, no network, a transient upstream — this
reports `checked=False` and claims nothing. Callers treat that as "carry on":
hiding a working microphone because one request failed would be a worse mistake
than the one this module exists to fix, and it would be invisible.
"""

import logging
import time
from dataclasses import dataclass

from openai import OpenAI

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

#: Entitlements change when somebody edits an OpenAI project, which is rare and
#: never mid-shift. An hour is short enough that granting access is visible
#: within one, and long enough that a polled health endpoint does not list
#: models on every request.
TTL_SECONDS = 3600

_cache: tuple[float, "VoiceAvailability"] | None = None


@dataclass(frozen=True)
class VoiceAvailability:
    """What this deployment can actually do, and how confident that is."""

    stt: bool
    """Transcription is expected to work."""

    tts: bool
    """Speech synthesis is expected to work."""

    checked: bool
    """Whether the model list was successfully read.

    False means the two flags above are optimistic defaults rather than
    findings, and nothing should be disabled on the strength of them.
    """

    detail: str
    """One line for an operator. Never shown to a user."""


def reset_cache() -> None:
    """Forget the probe. For tests, and for anything that changes the key."""
    global _cache
    _cache = None


def voice_availability(settings: Settings | None = None) -> VoiceAvailability:
    """Whether the configured speech models are reachable, cached for an hour."""
    global _cache
    settings = settings or get_settings()

    now = time.monotonic()
    if _cache is not None and now - _cache[0] < TTL_SECONDS:
        return _cache[1]

    result = _probe(settings)
    _cache = (now, result)
    return result


def _probe(settings: Settings) -> VoiceAvailability:
    if not settings.OPENAI_API_KEY:
        return VoiceAvailability(
            stt=True,
            tts=True,
            checked=False,
            detail="no API key configured, so voice availability was not checked",
        )

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=settings.OPENAI_TIMEOUT_SECONDS)
        available = {model.id for model in client.models.list()}
    except Exception as exc:
        # Optimistic on purpose — see the module note. A listing failure must not
        # take the microphone away from a deployment where it works.
        logger.warning("voice_probe_failed error=%s", type(exc).__name__)
        return VoiceAvailability(
            stt=True,
            tts=True,
            checked=False,
            detail=f"could not list models ({type(exc).__name__}); assuming voice is available",
        )

    stt_model = settings.OPENAI_TRANSCRIBE_MODEL
    tts_model = settings.OPENAI_TTS_MODEL
    stt = stt_model in available
    tts = tts_model in available

    missing = [name for name, ok in ((stt_model, stt), (tts_model, tts)) if not ok]
    detail = (
        "speech models are available"
        if not missing
        else (
            f"this OpenAI project has no access to {', '.join(missing)} — "
            f"an account entitlement, not a code fault"
        )
    )
    # Logged once per TTL rather than per request, and it names the models so an
    # operator can act without reproducing the failure.
    logger.info("voice_probe stt=%s tts=%s detail=%s", stt, tts, detail)

    return VoiceAvailability(stt=stt, tts=tts, checked=True, detail=detail)
