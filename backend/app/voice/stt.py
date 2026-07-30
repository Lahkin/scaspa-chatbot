"""Speech to text.

Audio is processed **entirely in memory** and discarded. Nothing is written to
disk, nothing is logged beyond a byte count and a latency, and no identifier is
ever recorded — CLAUDE.md rule 9. A recording of someone's voice is about as
personal as data gets, and this product has no reason to keep one.

## The vocabulary prompt matters more than it looks

Transcription models guess at proper nouns. Left alone they produce "Bass Terre",
"Port Zanty", "Deep Water Harbor" and "Robert L. Bradshore". Those are exactly
the words a SCASPA question is *about*, so a hint listing them materially
improves the transcript on the only tokens that carry meaning here.

## The transcript is never chained into the model

`POST /api/stt` returns text and stops. The frontend puts it in the input box so
the user can fix it before sending. A misheard fee or terminal name would
otherwise produce a confident answer to a question nobody asked — which is both
a bad experience and a bad demo moment.
"""

import logging
import struct
import time
from dataclasses import dataclass

from app.config import Settings, get_settings
from app.upstream import call_with_retry

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
# Slack on the duration estimate so a genuine 60-second clip is not rejected for
# being 61 by an approximation.
DURATION_TOLERANCE = 1.25

# Content types a browser's MediaRecorder actually produces, plus the common
# upload formats. Parameters like `;codecs=opus` are stripped before matching.
ALLOWED_CONTENT_TYPES = frozenset(
    {
        "audio/webm",
        "video/webm",  # MediaRecorder labels webm/opus this way in some browsers
        "audio/mp4",
        "audio/m4a",
        "audio/x-m4a",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/ogg",
        "application/ogg",
    }
)

# Bytes per second, low and high plausible bounds for speech in each container.
# Used only to bound the duration; see `estimate_duration`.
_BYTE_RATES: dict[str, tuple[int, int]] = {
    "webm": (3_000, 32_000),
    "ogg": (3_000, 32_000),
    "mp4": (4_000, 40_000),
    "m4a": (4_000, 40_000),
    "mpeg": (8_000, 40_000),
    "mp3": (8_000, 40_000),
    "wav": (16_000, 192_000),
}

VOCABULARY_PROMPT = (
    "This is a question about SCASPA, the St. Christopher Air and Sea Ports "
    "Authority in St. Kitts and Nevis. Likely terms include: SCASPA, Basseterre, "
    "Port Zante, Deep Water Harbour, Basseterre Ferry Terminal, Nevis, "
    "Robert L. Bradshaw International Airport, RLB, break-bulk, berth, berthing, "
    "manifest, stevedore, bill of lading, TEU, cruise call, harbour dues, tariff, "
    "Charlestown, Frigate Bay, EC dollars, XCD."
)

LANGUAGE_HINT = "en"


class STTUnavailableError(RuntimeError):
    """Transcription failed. Voice is an enhancement; the text path is unaffected."""


class AudioRejected(ValueError):
    """The upload was refused before any provider call. Carries a public reason."""


@dataclass
class AudioCheck:
    """Outcome of validating an upload."""

    content_type: str
    size_bytes: int
    duration_seconds: float | None
    duration_exact: bool


def normalise_content_type(raw: str | None) -> str:
    """Strip parameters and lowercase. `audio/webm;codecs=opus` -> `audio/webm`."""
    return (raw or "").split(";")[0].strip().lower()


def _subtype(content_type: str) -> str:
    subtype = content_type.split("/")[-1]
    return subtype.removeprefix("x-")


def wav_duration(data: bytes) -> float | None:
    """Exact duration for a RIFF/WAVE file, or None if it cannot be read."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return None
    offset = 12
    sample_rate = channels = bits = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        (chunk_size,) = struct.unpack("<I", data[offset + 4 : offset + 8])
        body = offset + 8
        if chunk_id == b"fmt " and body + 16 <= len(data):
            _, channels, sample_rate, _, _, bits = struct.unpack("<HHIIHH", data[body : body + 16])
        elif chunk_id == b"data" and sample_rate and channels and bits:
            return chunk_size / (sample_rate * channels * (bits / 8))
        offset = body + chunk_size + (chunk_size % 2)
    return None


def estimate_duration(data: bytes, content_type: str) -> tuple[float | None, bool]:
    """Best-effort duration. Returns `(seconds, exact)`.

    Exact for WAV, where the header states it. For compressed containers the
    duration is bounded rather than decoded: decoding would mean shipping a
    media library for a guard the size cap already backstops.

    The bound is deliberately asymmetric. A clip is rejected only when even the
    *highest* plausible bitrate puts it over the limit — i.e. when it is
    certainly too long. An ambiguous clip is accepted, because wrongly refusing
    a traveller's question is worse than occasionally paying for a longer one.
    """
    if _subtype(content_type) == "wav":
        exact = wav_duration(data)
        if exact is not None:
            return exact, True

    rates = _BYTE_RATES.get(_subtype(content_type))
    if not rates:
        return None, False
    _, high_rate = rates
    # Highest bitrate implies the shortest possible duration for this size.
    return len(data) / high_rate, False


def validate_audio(data: bytes, content_type: str | None) -> AudioCheck:
    """Validate an upload before spending anything on it.

    Raises `AudioRejected` with a message written for a user.
    """
    normalised = normalise_content_type(content_type)

    if normalised not in ALLOWED_CONTENT_TYPES:
        raise AudioRejected(
            f"That audio format is not supported ({normalised or 'unknown'}). "
            "Please send WebM, MP4, M4A, MP3, WAV or OGG."
        )

    if not data:
        raise AudioRejected("The recording was empty. Please try again.")

    if len(data) > MAX_AUDIO_BYTES:
        megabytes = len(data) / (1024 * 1024)
        raise AudioRejected(
            f"That recording is {megabytes:.1f} MB. The limit is "
            f"{MAX_AUDIO_BYTES // (1024 * 1024)} MB — please record a shorter question."
        )

    duration, exact = estimate_duration(data, normalised)
    if duration is not None and duration > MAX_AUDIO_SECONDS * DURATION_TOLERANCE:
        measured = f"{duration:.0f} seconds" if exact else f"at least {duration:.0f} seconds"
        raise AudioRejected(
            f"That recording is {measured}. Please keep it under "
            f"{MAX_AUDIO_SECONDS} seconds and ask one question at a time."
        )

    return AudioCheck(
        content_type=normalised,
        size_bytes=len(data),
        duration_seconds=duration,
        duration_exact=exact,
    )


def build_transcription_client(settings: Settings | None = None):  # noqa: ANN201
    from openai import OpenAI

    settings = settings or get_settings()
    return OpenAI(api_key=settings.OPENAI_API_KEY or None, timeout=settings.OPENAI_TIMEOUT_SECONDS)


def transcribe(
    data: bytes,
    filename: str = "audio.webm",
    settings: Settings | None = None,
    client=None,  # noqa: ANN001
) -> str:
    """Transcribe audio held in memory. Returns the transcript text only.

    The bytes are passed to the provider from memory and never written to disk.
    Neither the audio nor the transcript is logged.
    """
    settings = settings or get_settings()
    started = time.perf_counter()
    client = client or build_transcription_client(settings)

    try:
        response = call_with_retry(
            lambda: client.audio.transcriptions.create(
                model=settings.OPENAI_TRANSCRIBE_MODEL,
                file=(filename, data),
                language=LANGUAGE_HINT,
                prompt=VOCABULARY_PROMPT,
                response_format="text",
            ),
            settings=settings,
        )
    except Exception as exc:
        logger.warning("stt_failed error=%s", type(exc).__name__)
        raise STTUnavailableError(str(exc)) from exc

    text = response if isinstance(response, str) else getattr(response, "text", str(response))
    text = text.strip()

    elapsed = int((time.perf_counter() - started) * 1000)
    # Size and latency only. Never the audio, never the transcript, never an
    # identifier — CLAUDE.md rule 9.
    logger.info("stt_transcribed bytes=%d chars=%d latency_ms=%d", len(data), len(text), elapsed)
    return text
