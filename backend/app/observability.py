"""Structured JSON logging and the question log.

## Log the question. Never log who asked it.

The question text is the most valuable thing this system produces — it is a direct
record of what real travellers and hauliers want to know, and it feeds the
researchers' gaps list. So it is logged in full.

What is never logged, anywhere: IP address, user agent, any device or session
fingerprint, or any identifier beyond the ephemeral `conversation_id` (a random
UUID that expires within the hour and links to nothing). CLAUDE.md rule 9.

That combination is what makes the question log defensible rather than
uncomfortable: it is a record of *questions*, not of *people*. Losing it would
leak curiosity, not identity.

## Why JSON

The fields below are the ones an operator actually needs to answer "why was that
answer bad" — retrieval scores, the grounded flag, tool calls, token counts — and
grepping formatted strings for them does not scale past a rehearsal.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from app.config import Settings, get_settings

# Fields the formatter promotes to top level rather than leaving in the message.
_EXTRA_FIELDS = (
    "request_id",
    "route",
    "method",
    "status",
    "latency_ms",
    "conversation_id",
    "question",
    "answered",
    "grounded",
    "refusal",
    "refusal_category",
    "tool_calls",
    "tool_names",
    "prompt_tokens",
    "completion_tokens",
    "retrieval_scores",
    "best_score",
    "cited_ids",
    "hallucinated_citations",
    "ungrounded_numbers",
    "kb_version",
    "event",
)

# Anything resembling an identifier must never appear in a log record, even by
# accident from a future caller. Enforced, not just documented.
FORBIDDEN_FIELDS = frozenset(
    {
        "ip",
        "client_ip",
        "remote_addr",
        "x_forwarded_for",
        "user_agent",
        "useragent",
        "session_id",
        "user_id",
        "device_id",
        "cookie",
        "authorization",
        "email",
        "audio",
        "transcript",
    }
)


class IdentifierLeak(AssertionError):
    """A log record carried a field that must never be logged."""


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with the diagnostic fields promoted."""

    def format(self, record: logging.LogRecord) -> str:
        for forbidden in FORBIDDEN_FIELDS:
            if hasattr(record, forbidden):
                raise IdentifierLeak(
                    f"log record carried {forbidden!r}, which must never be logged "
                    f"(CLAUDE.md rule 9)"
                )

        payload: dict = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for name in _EXTRA_FIELDS:
            value = getattr(record, name, None)
            if value is not None:
                payload[name] = value
        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            # The traceback goes to the log, never to a client.
            payload["traceback"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


@dataclass
class TurnLog:
    """The per-turn record. Assembled once, logged once, exported later."""

    request_id: str
    route: str
    question: str
    conversation_id: str | None = None
    answered: bool = False
    grounded: bool = False
    refusal: bool = False
    refusal_category: str | None = None
    latency_ms: int = 0
    tool_names: list[str] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    best_score: float = 0.0
    retrieval_scores: list[float] = field(default_factory=list)
    cited_ids: list[str] = field(default_factory=list)
    hallucinated_citations: list[str] = field(default_factory=list)
    ungrounded_numbers: list[str] = field(default_factory=list)
    kb_version: str | None = None

    def as_extra(self) -> dict:
        return {
            "event": "turn",
            "request_id": self.request_id,
            "route": self.route,
            "question": self.question,
            "conversation_id": self.conversation_id,
            "answered": self.answered,
            "grounded": self.grounded,
            "refusal": self.refusal,
            "refusal_category": self.refusal_category,
            "latency_ms": self.latency_ms,
            "tool_calls": len(self.tool_names),
            "tool_names": self.tool_names,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "best_score": round(self.best_score, 4),
            "retrieval_scores": [round(s, 4) for s in self.retrieval_scores],
            "cited_ids": self.cited_ids,
            "hallucinated_citations": self.hallucinated_citations,
            "ungrounded_numbers": self.ungrounded_numbers,
            "kb_version": self.kb_version,
        }


def log_turn(turn: TurnLog, logger: logging.Logger | None = None) -> None:
    """Emit the structured turn record."""
    (logger or logging.getLogger("app.turn")).info("turn", extra=turn.as_extra())


def append_question_log(turn: TurnLog, settings: Settings | None = None) -> None:
    """Append one question to the question log for later export.

    Deliberately a separate append-only file rather than something parsed out of
    application logs: the export must not depend on log retention, and keeping it
    separate makes it obvious exactly what is being kept.
    """
    settings = settings or get_settings()
    path: Path = settings.question_log_path
    record = {
        "ts": datetime.now(UTC).isoformat(timespec="seconds"),
        "question": turn.question,
        "answered": turn.answered,
        "grounded": turn.grounded,
        "refusal": turn.refusal,
        "refusal_category": turn.refusal_category,
        "cited_ids": turn.cited_ids,
        "latency_ms": turn.latency_ms,
        "kb_version": turn.kb_version,
        # No IP, no user agent, no session. The conversation id is deliberately
        # absent too: it would let two questions be linked into one visit.
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        # A full disk must not take the API down over an analytics file.
        logging.getLogger(__name__).warning("question_log_write_failed", exc_info=True)


def timer():  # noqa: ANN201
    """Monotonic millisecond timer."""
    started = time.perf_counter()

    def elapsed_ms() -> int:
        return int((time.perf_counter() - started) * 1000)

    return elapsed_ms
