"""Voice endpoints.

Thin: validate, call a service, return — CLAUDE.md rule 7.

**Voice is an enhancement.** Every failure here is contained: a provider outage
returns a clean error envelope and `POST /api/chat` is entirely unaffected. If
the microphone dies on stage you keep going by typing, without comment.

Audio never touches disk. Uploads are read into memory, forwarded, and dropped.
The only audio written anywhere is the cache of *synthesised* output.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response

from app.config import Settings, get_settings
from app.errors import AppError, ErrorCode
from app.schemas import ErrorEnvelope, SttResponse, TtsRequest
from app.voice.stt import AudioRejected, STTUnavailableError, transcribe, validate_audio
from app.voice.tts import TTSUnavailableError, sanitise_for_speech, synthesise

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])

# One hour. The audio for a given text never changes, and the ETag makes
# revalidation cheap.
TTS_CACHE_CONTROL = "public, max-age=3600"


class VoiceUnavailableError(AppError):
    """A voice provider failed. The text path still works."""

    code = ErrorCode.UPSTREAM_TIMEOUT
    status_code = 503
    message = (
        "Voice is unavailable right now. You can still type your question — "
        "everything else is working normally."
    )


class AudioRejectedError(AppError):
    """The upload was refused before any provider call."""

    code = ErrorCode.VALIDATION_ERROR
    status_code = 422


@router.post(
    "/stt",
    response_model=SttResponse,
    summary="Transcribe speech to text",
    responses={
        422: {"model": ErrorEnvelope, "description": "Unsupported format, too large or too long"},
        503: {"model": ErrorEnvelope, "description": "Transcription provider unavailable"},
    },
)
async def post_stt(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    audio: Annotated[UploadFile, File(description="Recorded audio. Max 20 MB, about 60 seconds.")],
) -> SttResponse:
    """Transcribe an audio upload.

    Returns the transcript and **nothing else**. It is deliberately not chained
    into the assistant: the frontend puts this in the input box so the user can
    correct a misheard terminal name or figure before asking.
    """
    data = await audio.read()

    try:
        check = validate_audio(data, audio.content_type)
    except AudioRejected as exc:
        raise AudioRejectedError(str(exc)) from exc

    try:
        text = transcribe(data, filename=audio.filename or "audio.webm", settings=settings)
    except STTUnavailableError as exc:
        raise VoiceUnavailableError(log_detail=f"stt: {exc}") from exc
    finally:
        # Drop the reference promptly; it is never written anywhere.
        del data

    logger.info(
        "stt_request bytes=%d content_type=%s request_id=%s",
        check.size_bytes,
        check.content_type,
        getattr(request.state, "request_id", "-"),
    )
    return SttResponse(text=text)


@router.post(
    "/tts",
    summary="Synthesise text to speech",
    response_class=Response,
    responses={
        200: {"content": {"audio/mpeg": {}}, "description": "MP3 audio"},
        422: {"model": ErrorEnvelope, "description": "Empty or over the length limit"},
        503: {"model": ErrorEnvelope, "description": "Speech provider unavailable"},
    },
)
async def post_tts(
    payload: TtsRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Speak an answer.

    The text is sanitised first — markdown, citation markers, URLs and JSON are
    removed, and phone numbers and currency are expanded so they can be written
    down by someone listening.
    """
    try:
        audio, entry = synthesise(payload.text, settings=settings)
    except ValueError as exc:
        raise AudioRejectedError(str(exc)) from exc
    except TTSUnavailableError as exc:
        raise VoiceUnavailableError(log_detail=f"tts: {exc}") from exc

    etag = f'"{entry.digest[:32]}"'
    # A matching ETag means the browser already has this audio.
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": TTS_CACHE_CONTROL})

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": TTS_CACHE_CONTROL,
            "ETag": etag,
            "Content-Length": str(len(audio)),
            "X-TTS-Cache": "hit" if entry.hit else "miss",
        },
    )


@router.post(
    "/tts/preview",
    summary="Show what TTS would say, without synthesising",
    response_model=SttResponse,
)
async def post_tts_preview(payload: TtsRequest) -> SttResponse:
    """Return the sanitised text that would be spoken.

    No provider call and no cost. Useful for the frontend, and the fastest way
    to find a sanitisation bug without listening to every variation.
    """
    return SttResponse(text=sanitise_for_speech(payload.text))
