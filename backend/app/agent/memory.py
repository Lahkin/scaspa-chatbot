"""In-memory conversation store.

## The privacy position, stated plainly

Conversations live in this process's memory and nowhere else. Nothing is written
to disk, no database is involved, and nothing survives a restart. The store holds
only the question text and the answer text, keyed by a random UUID that the
server mints and hands back to the client.

It deliberately does **not** hold: IP addresses, user agents, cookies, accounts,
names, device identifiers, or anything else that could tie a conversation to a
person. There is no join key to any other system, because there is no other
system. A conversation id is an opaque random value; losing it means losing the
conversation, which is the intended trade.

Entries expire `CONVERSATION_TTL_MINUTES` after their last use, and only the
last `MAX_HISTORY_TURNS` exchanges are kept.

See `docs/decisions.md` 0008. This is a product commitment the presenters can
state out loud, not an implementation detail.
"""

import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass
class Turn:
    """One question and the answer given to it."""

    question: str
    answer: str
    at: datetime


@dataclass
class Conversation:
    """A capped, expiring list of turns."""

    conversation_id: str
    turns: list[Turn] = field(default_factory=list)
    last_used: datetime = field(default_factory=lambda: datetime.now(UTC))


class ConversationStore:
    """Thread-safe, in-process, non-persistent conversation memory.

    Not shared between workers. Two uvicorn workers keep separate stores, so a
    client may lose history if a later request lands elsewhere. That is accepted
    for now: the alternative is external storage, which would break the privacy
    position above. Revisit only with a deliberate decision recorded.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._conversations: dict[str, Conversation] = {}
        self._lock = threading.Lock()

    @property
    def _ttl(self) -> timedelta:
        return timedelta(minutes=self._settings.CONVERSATION_TTL_MINUTES)

    def new_id(self) -> str:
        """Mint an opaque conversation id. Random; carries no information."""
        return str(uuid.uuid4())

    def adopt_or_mint(self, offered: str | None) -> str:
        """The id to use for this turn: the client's, if it is one we could have minted.

        The store is not shared between workers, so an id this process has never
        seen is still legitimate — it may belong to a sibling. Membership
        therefore cannot be the test, and the shape is: anything that is not a
        well-formed UUID was never minted here, so it is replaced rather than
        adopted.

        This is a tidiness guarantee, not a security one. A conversation holds
        only question and answer text and is keyed by a random value, so there is
        nothing to take over — but a server that echoes back whatever arbitrary
        string it is handed invites someone to conclude otherwise.
        """
        if offered is None:
            return self.new_id()
        try:
            uuid.UUID(offered)
        except ValueError:
            logger.info("conversation_id_replaced reason=not_a_uuid")
            return self.new_id()
        return offered

    def _purge_expired(self, now: datetime) -> None:
        """Drop conversations idle beyond the TTL. Caller holds the lock."""
        expired = [
            key
            for key, conversation in self._conversations.items()
            if now - conversation.last_used > self._ttl
        ]
        for key in expired:
            del self._conversations[key]
        if expired:
            logger.info("conversation_evicted count=%d reason=ttl", len(expired))

    def get(self, conversation_id: str) -> list[Turn]:
        """Turns for a conversation, oldest first. Unknown or expired gives []."""
        now = datetime.now(UTC)
        with self._lock:
            self._purge_expired(now)
            conversation = self._conversations.get(conversation_id)
            if conversation is None:
                return []
            conversation.last_used = now
            return list(conversation.turns)

    def append(self, conversation_id: str, question: str, answer: str) -> None:
        """Record an exchange, trimming to the most recent MAX_HISTORY_TURNS."""
        now = datetime.now(UTC)
        with self._lock:
            self._purge_expired(now)
            conversation = self._conversations.get(conversation_id)
            if conversation is None:
                conversation = Conversation(conversation_id=conversation_id)
                self._conversations[conversation_id] = conversation

            conversation.turns.append(Turn(question=question, answer=answer, at=now))
            limit = self._settings.MAX_HISTORY_TURNS
            if len(conversation.turns) > limit:
                conversation.turns = conversation.turns[-limit:]
            conversation.last_used = now

    def forget(self, conversation_id: str) -> bool:
        """Drop a conversation immediately. True if one was removed."""
        with self._lock:
            return self._conversations.pop(conversation_id, None) is not None

    def active_count(self) -> int:
        """Live conversations, after purging expired ones."""
        with self._lock:
            self._purge_expired(datetime.now(UTC))
            return len(self._conversations)


_store: ConversationStore | None = None


def get_conversation_store() -> ConversationStore:
    """Process-wide store. A FastAPI dependency, overridable in tests."""
    global _store  # noqa: PLW0603 — one process-wide store by design
    if _store is None:
        _store = ConversationStore()
    return _store


def reset_conversation_store() -> None:
    """Drop every conversation. Used by tests."""
    global _store  # noqa: PLW0603
    _store = None
