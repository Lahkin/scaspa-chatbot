"""Chat endpoints.

Thin: validate, call the answer service, shape the response — CLAUDE.md rule 7.
All grounding and citation logic lives in `app.rag.answer`; nothing here decides
what is safe to say.

Two endpoints returning identical content:

* `POST /api/chat` — one JSON response.
* `POST /api/chat/stream` — the same answer as Server-Sent Events.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.agent.memory import ConversationStore, get_conversation_store
from app.config import Settings, get_settings
from app.costs import SpendTracker, get_spend_tracker
from app.errors import (
    AppError,
    ErrorCode,
    IndexMissingError,
    RateLimitedError,
    RetrievalEmptyError,
    log_app_error,
)
from app.observability import TurnLog, append_question_log, log_turn
from app.ops.cards import build_card
from app.ops.source import OpsSource, get_ops_source
from app.rag.answer import AnswerResult, answer_question, astream_answer
from app.rag.ingest import read_index_meta
from app.ratelimit import RateLimiter, get_rate_limiter
from app.safety import InputRejected, sanitise_user_input
from app.schemas import (
    AssistantCard,
    CardRequest,
    ChatRequest,
    ChatResponse,
    Citation,
    ErrorEnvelope,
    ResponseMeta,
    ToolCall,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

# Some proxies buffer text/event-stream until the response completes, which
# turns streaming into a slow non-stream. These headers ask them not to.
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class MessageRejectedError(AppError):
    """Input safety refused the message."""

    code = ErrorCode.VALIDATION_ERROR
    status_code = 422


def enforce_rate_limit(request: Request, limiter: RateLimiter, scope: str = "chat") -> None:
    """Check the per-client limit.

    The IP is read here, hashed into a key, and discarded. It is never logged and
    never stored — see `app.ratelimit`.
    """
    ip = request.client.host if request.client else None
    decision = limiter.check(ip, scope=scope)
    if not decision.allowed:
        raise RateLimitedError(retry_after=decision.retry_after)


def clean_message(payload: ChatRequest, settings: Settings) -> tuple[str, list[str]]:
    """Apply input safety, translating a rejection into a 422."""
    try:
        return sanitise_user_input(payload.message, settings.MAX_MESSAGE_CHARS)
    except InputRejected as exc:
        raise MessageRejectedError(str(exc)) from exc


def _require_index(settings: Settings) -> str | None:
    """Fail fast when there is no index to answer from. Returns kb_version."""
    meta = read_index_meta(settings)
    if meta is None:
        raise IndexMissingError(log_detail="data/index_meta.json is absent")
    if meta.kb_rows_indexed <= 0:
        raise RetrievalEmptyError(log_detail="index metadata exists but no rows are indexed")
    return meta.kb_version


def _card_for(result: AnswerResult, source: OpsSource) -> AssistantCard | None:
    """Populate the card the model asked for, if it asked for one.

    The request holds a kind and a filter; every row comes from `source`. That
    separation is the whole safety property — see `app/ops/cards.py`.
    """
    if result.card is None:
        return None
    return build_card(result.card, source)


def _to_response(
    result: AnswerResult,
    conversation_id: str,
    request_id: str,
    kb_version: str | None,
    card: AssistantCard | None = None,
    question_sanitised: str | None = None,
) -> ChatResponse:
    """Map the service result onto the wire shape."""
    return ChatResponse(
        answer=result.answer,
        conversation_id=conversation_id,
        question_sanitised=question_sanitised,
        grounded=result.grounded,
        refusal=result.refusal,
        refusal_category=result.refusal_category,
        answer_replaced=result.answer_replaced,
        step_limit_reached=result.hit_tool_limit,
        citations=[Citation(**c.model_dump()) for c in result.citations],
        chart=result.chart,
        card=card,
        tool_calls=[ToolCall(name=t.name, summary=t.summary, ms=t.ms) for t in result.tool_calls],
        meta=ResponseMeta(
            request_id=request_id,
            latency_ms=result.latency_ms,
            retrieved_count=len(result.retrieved),
            best_score=result.best_score,
            cited_ids=result.cited_ids,
            hallucinated_citations=result.hallucinated_citations,
            unverified_figures=result.unverified_figures,
            kb_version=kb_version,
        ),
    )


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask a question",
    responses={
        422: {"model": ErrorEnvelope, "description": "Message empty or over 1000 characters"},
        503: {"model": ErrorEnvelope, "description": "Index unavailable or upstream busy"},
        504: {"model": ErrorEnvelope, "description": "Upstream timed out"},
    },
)
async def post_chat(
    payload: ChatRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    store: Annotated[ConversationStore, Depends(get_conversation_store)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    tracker: Annotated[SpendTracker, Depends(get_spend_tracker)],
    source: Annotated[OpsSource, Depends(get_ops_source)],
) -> ChatResponse:
    """Answer one question from the verified knowledge base."""
    enforce_rate_limit(request, limiter, scope="chat")
    message, injections = clean_message(payload, settings)
    kb_version = _require_index(settings)
    conversation_id = store.adopt_or_mint(payload.conversation_id)
    request_id = getattr(request.state, "request_id", "-")

    if injections:
        logger.warning("injection_neutralised route=/api/chat count=%d", len(injections))

    result = answer_question(message, category=payload.category, settings=settings)
    tracker.record_turn(result.prompt_tokens, result.completion_tokens)

    turn = TurnLog(
        request_id=request_id,
        route="/api/chat",
        question=message,
        conversation_id=conversation_id,
        answered=not result.refusal,
        grounded=result.grounded,
        refusal=result.refusal,
        refusal_category=result.refusal_category,
        latency_ms=result.latency_ms,
        tool_names=[t.name for t in result.tool_calls],
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        best_score=result.best_score,
        retrieval_scores=[c.score for c in result.retrieved],
        cited_ids=result.cited_ids,
        hallucinated_citations=result.hallucinated_citations,
        ungrounded_numbers=result.ungrounded_numbers,
        kb_version=kb_version,
    )
    log_turn(turn)
    append_question_log(turn, settings)

    # History is recorded but not yet fed back into the prompt: this prompt is
    # plumbing and must not change answer behaviour. Wiring it in is a separate,
    # measurable change.
    store.append(conversation_id, message, result.answer)

    return _to_response(
        result,
        conversation_id,
        request_id,
        kb_version,
        _card_for(result, source),
        # Only when safety actually changed the question. Echoing it back
        # unchanged would make every client compare two identical strings to
        # decide whether to show a notice.
        question_sanitised=message if message != payload.message else None,
    )


def sse(event: str, data: dict) -> str:
    """Format one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.post(
    "/chat/stream",
    summary="Ask a question, streamed as Server-Sent Events",
    response_class=StreamingResponse,
)
async def post_chat_stream(
    payload: ChatRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    store: Annotated[ConversationStore, Depends(get_conversation_store)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    source: Annotated[OpsSource, Depends(get_ops_source)],
) -> StreamingResponse:
    """Stream an answer.

    Event order: `meta` → `token`* → `citations` → `done`. An `error` event may
    replace the tail at any point.

    Tokens carry `[kb-014]` markers **raw**. A chunk boundary can land inside a
    marker, so the server does not strip them mid-stream; the client renders them
    inline and reconciles against `citations` when it arrives.
    """
    enforce_rate_limit(request, limiter, scope="chat")
    message, injections = clean_message(payload, settings)
    if injections:
        # Logged on both routes now. The stream used to discard the result of its
        # own safety pass, so a neutralised question was invisible in the logs
        # and invisible to the client.
        logger.warning("injection_neutralised route=/api/chat/stream count=%d", len(injections))
    kb_version = _require_index(settings)
    conversation_id = store.adopt_or_mint(payload.conversation_id)
    request_id = getattr(request.state, "request_id", "-")

    async def generate() -> AsyncIterator[str]:
        # Sent before any token so the client can attach state immediately.
        #
        # `question_sanitised` rides on `meta` rather than on `done` because it
        # describes what was SENT, not what came back — the user's own words
        # changed on screen and the correction belongs there before the answer
        # starts arriving, not after it has finished.
        yield sse(
            "meta",
            {
                "conversation_id": conversation_id,
                "question_sanitised": message if message != payload.message else None,
            },
        )

        pieces: list[str] = []
        try:
            # `aclosing` guarantees the generator's aclose() runs when this task
            # is cancelled, which propagates GeneratorExit into astream_answer and
            # closes the upstream connection. That is what stops a closed tab from
            # burning tokens.
            #
            # Note: we deliberately do NOT poll `request.is_disconnected()` here.
            # StreamingResponse already runs its own `listen_for_disconnect`
            # consuming the same ASGI receive channel; a second consumer competes
            # for those messages and can make Starlette miss the disconnect
            # entirely. Cancellation is the supported mechanism, and it was
            # verified to fire.
            async with aclosing(
                astream_answer(
                    message,
                    category=payload.category,
                    settings=settings,
                )
            ) as stream:
                async for event, data in stream:
                    # The answer chain yields a card *request*; the rows are
                    # filled in here, from the feed. The internal event never
                    # reaches the client — it is renamed to `card` and carries a
                    # fully populated payload, identical to the field on
                    # `POST /api/chat`, so the two endpoints agree.
                    if event == "_card_request":
                        request_model = CardRequest.model_validate(data["request"])
                        yield sse("card", build_card(request_model, source).model_dump(mode="json"))
                        continue
                    if event == "token":
                        pieces.append(data["text"])
                    elif event == "done":
                        data = {**data, "kb_version": kb_version}
                    yield sse(event, data)

        except (asyncio.CancelledError, GeneratorExit):
            # The client hung up. Upstream generation is abandoned by the
            # aclosing() above; re-raise so the server tears the task down.
            logger.info(
                "client_disconnected request_id=%s token_frames=%d", request_id, len(pieces)
            )
            raise
        except AppError as exc:
            # Headers are already sent, so the status code cannot change. Emit an
            # error frame and close cleanly rather than hanging the connection.
            log_app_error(exc, request_id)
            yield sse(
                "error",
                {"code": exc.code.value, "message": exc.message, "request_id": request_id},
            )
        except Exception:
            logger.exception("stream_failed request_id=%s", request_id)
            yield sse(
                "error",
                {
                    "code": ErrorCode.INTERNAL.value,
                    "message": AppError.message,
                    "request_id": request_id,
                },
            )
        finally:
            # Record whatever was produced, even on a disconnect or an error, so
            # a resumed conversation is not silently missing a turn.
            if pieces:
                store.append(conversation_id, message, "".join(pieces))
            log_turn(
                TurnLog(
                    request_id=request_id,
                    route="/api/chat/stream",
                    question=message,
                    conversation_id=conversation_id,
                    answered=bool(pieces),
                    kb_version=kb_version,
                )
            )

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)
