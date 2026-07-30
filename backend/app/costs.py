"""Running spend estimate, accumulated in memory.

## This is an estimate, and it is not the safety net

It counts tokens the application saw and multiplies by rates from settings. It
will drift from the real bill: it does not know about cached-input pricing, tool
overhead, retries inside the SDK, or a rate change.

**The actual protection is a hard monthly spending cap set on the OpenAI account
itself.** An application-level counter cannot stop spend it does not see — a bug
that bypasses this module, a second deployment, or someone running a script with
the same key. Set the provider cap; treat this as the early-warning light, not the
fuse. See `docs/deploy.md`.

## No identifiers

Tokens, counts and totals only. Nothing here records who caused the spend.
"""

import logging
import threading
from dataclasses import dataclass
from datetime import UTC, date, datetime

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass
class DayTotals:
    """One UTC day's accumulated usage."""

    day: date
    prompt_tokens: int = 0
    completion_tokens: int = 0
    embedding_tokens: int = 0
    transcribe_seconds: float = 0.0
    tts_characters: int = 0
    turns: int = 0
    warned: bool = False

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class SpendEstimate:
    """A costed view of one day."""

    day: str
    turns: int
    prompt_tokens: int
    completion_tokens: int
    embedding_tokens: int
    transcribe_seconds: float
    tts_characters: int
    chat_usd: float
    embedding_usd: float
    voice_usd: float
    total_usd: float
    daily_limit_usd: float
    over_threshold: bool
    note: str = (
        "Estimate from tokens this process observed, priced from settings. The "
        "authoritative limit is the hard monthly cap on the OpenAI account."
    )


class SpendTracker:
    """Accumulates usage per UTC day, in memory.

    Resets on restart, like everything else here. That is a limitation and is
    stated rather than hidden: a restart hides prior spend from this counter but
    not from the provider cap, which is why the provider cap is the real control.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._days: dict[date, DayTotals] = {}
        self._lock = threading.Lock()

    def _today(self) -> DayTotals:
        today = datetime.now(UTC).date()
        return self._days.setdefault(today, DayTotals(day=today))

    def record_turn(self, prompt_tokens: int, completion_tokens: int) -> None:
        with self._lock:
            totals = self._today()
            totals.prompt_tokens += max(prompt_tokens, 0)
            totals.completion_tokens += max(completion_tokens, 0)
            totals.turns += 1
        self._warn_if_over()

    def record_embedding(self, tokens: int) -> None:
        with self._lock:
            self._today().embedding_tokens += max(tokens, 0)

    def record_voice(self, seconds: float = 0.0, characters: int = 0) -> None:
        with self._lock:
            totals = self._today()
            totals.transcribe_seconds += max(seconds, 0.0)
            totals.tts_characters += max(characters, 0)
        self._warn_if_over()

    def estimate(self, day: date | None = None) -> SpendEstimate:
        settings = self._settings
        with self._lock:
            target = day or datetime.now(UTC).date()
            totals = self._days.get(target, DayTotals(day=target))

            chat = (
                totals.prompt_tokens / 1_000_000 * settings.PRICE_CHAT_INPUT_PER_MTOK
                + totals.completion_tokens / 1_000_000 * settings.PRICE_CHAT_OUTPUT_PER_MTOK
            )
            embedding = totals.embedding_tokens / 1_000_000 * settings.PRICE_EMBEDDING_PER_MTOK
            voice = (
                totals.transcribe_seconds / 60 * settings.PRICE_TRANSCRIBE_PER_MINUTE
                + totals.tts_characters / 1_000_000 * settings.PRICE_TTS_PER_MCHAR
            )
            total = chat + embedding + voice

            return SpendEstimate(
                day=target.isoformat(),
                turns=totals.turns,
                prompt_tokens=totals.prompt_tokens,
                completion_tokens=totals.completion_tokens,
                embedding_tokens=totals.embedding_tokens,
                transcribe_seconds=round(totals.transcribe_seconds, 1),
                tts_characters=totals.tts_characters,
                chat_usd=round(chat, 4),
                embedding_usd=round(embedding, 4),
                voice_usd=round(voice, 4),
                total_usd=round(total, 4),
                daily_limit_usd=settings.DAILY_SPEND_WARN_USD,
                over_threshold=total >= settings.DAILY_SPEND_WARN_USD,
            )

    def _warn_if_over(self) -> None:
        """Warn once per day when the estimate crosses the threshold."""
        estimate = self.estimate()
        if not estimate.over_threshold:
            return
        with self._lock:
            totals = self._today()
            if totals.warned:
                return
            totals.warned = True
        logger.warning(
            "daily_spend_threshold_crossed estimate_usd=%.2f threshold_usd=%.2f turns=%d",
            estimate.total_usd,
            estimate.daily_limit_usd,
            estimate.turns,
        )

    def reset(self) -> None:
        with self._lock:
            self._days.clear()

    def history(self) -> list[SpendEstimate]:
        with self._lock:
            days = sorted(self._days)
        return [self.estimate(day) for day in days]


_tracker: SpendTracker | None = None


def get_spend_tracker() -> SpendTracker:
    global _tracker  # noqa: PLW0603 — one per process by design
    if _tracker is None:
        _tracker = SpendTracker()
    return _tracker


def reset_spend_tracker() -> None:
    global _tracker  # noqa: PLW0603
    _tracker = None
