"""Whether this deployment can do voice at all.

## The problem this exists to solve

`VITE_ENABLE_VOICE` defaults to true, so the microphone and the speak button are
rendered for every user. Whether they can work is decided by an API key that a
different person holds, so the control was a promise the product could not keep
— offered to someone who may be standing on a pier trying to use it.

A build-time flag cannot fix that. Only the backend knows, so the backend says.

## Two providers, two different questions

**OpenAI.** The failure is an entitlement: this project's key returns nine
models and not one can transcribe or synthesise, so any audio call comes back
`403 — Project proj_… does not have access to model`. Listing models answers it
exactly, and free.

**ElevenLabs.** The key either reaches the API or it does not, and then there is
a second, separate question: *which voice*. `ELEVENLABS_VOICE_ID` has no default
on purpose — picking one in source would choose an accent, a gender and a
register for a Caribbean port authority on the strength of what a developer saw
first in a list. So a reachable account with no voice chosen is a real
**half-available** state: transcription works, synthesis does not, and the
detail says which command lists the voices.

Listing voices doubles as the reachability check — the cheapest authenticated
call the API has, whose answer is what the operator needs anyway.

## Neither probe replaces the error path

A provider outage is a different event and is handled where it happens. This
answers "can this deployment do voice at all", once an hour, so a control that
cannot work is never drawn.

## Unknown is not unavailable

If the probe cannot run — no key, no network, a transient upstream — this
reports `checked=False` and claims nothing. Callers treat that as carry on:
hiding a working microphone because one request failed would be a worse mistake
than the one this module exists to fix, and a far quieter one.
"""

import logging
import time
from dataclasses import dataclass

from openai import OpenAI

from app.config import Settings, get_settings
from app.voice.provider import elevenlabs_voices, resolve_provider

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

    provider: str = "openai"
    """Which provider answered, with `auto` already resolved.

    Reported so nobody has to infer it from a key they cannot see. It is the
    first thing to establish when voice misbehaves, and guessing it wrong sends
    somebody to the wrong dashboard.
    """


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
    if resolve_provider(settings) == "elevenlabs":
        return _probe_elevenlabs(settings)
    return _probe_openai(settings)


def _probe_elevenlabs(settings: Settings) -> VoiceAvailability:
    """Can this key reach ElevenLabs, and has a voice been chosen?

    Two separate questions, and they fail differently:

    * **No key** — nothing can work, and it is not a finding, because a
      deployment without a key was never asked to do voice.
    * **A key but no `ELEVENLABS_VOICE_ID`** — transcription works and
      synthesis does not. That is a real, reportable, *half*-available state,
      and it is the one this account will be in until somebody chooses a voice.

    Listing voices doubles as the reachability check: it is the cheapest
    authenticated call the API has, and its answer is the thing the operator
    needs anyway.
    """
    if not settings.ELEVENLABS_API_KEY.strip():
        return VoiceAvailability(
            stt=True,
            tts=True,
            checked=False,
            detail="no ElevenLabs key configured, so voice availability was not checked",
            provider="elevenlabs",
        )

    try:
        voices = elevenlabs_voices(settings)
    except Exception as exc:
        logger.warning("voice_probe_failed provider=elevenlabs error=%s", type(exc).__name__)
        return VoiceAvailability(
            stt=True,
            tts=True,
            checked=False,
            detail=(
                f"could not reach ElevenLabs ({type(exc).__name__}); assuming voice is available"
            ),
            provider="elevenlabs",
        )

    chosen = settings.ELEVENLABS_VOICE_ID.strip()
    ids = {voice_id for voice_id, _ in voices}

    if not chosen:
        detail = (
            f"ElevenLabs is reachable with {len(voices)} voices, but ELEVENLABS_VOICE_ID is "
            f"not set — run scripts/voice_smoke.py --voices and choose one"
        )
        tts = False
    elif chosen not in ids:
        detail = f"ELEVENLABS_VOICE_ID {chosen!r} is not one of this account's {len(voices)} voices"
        tts = False
    else:
        name = next((n for i, n in voices if i == chosen), chosen)
        detail = f"ElevenLabs is reachable; speaking as {name!r}"
        tts = True

    logger.info("voice_probe provider=elevenlabs stt=True tts=%s detail=%s", tts, detail)
    return VoiceAvailability(stt=True, tts=tts, checked=True, detail=detail, provider="elevenlabs")


def _probe_openai(settings: Settings) -> VoiceAvailability:
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
