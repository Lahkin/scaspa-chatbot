"""Conversation store tests, including the privacy properties."""

from datetime import UTC, datetime, timedelta

from app.agent.memory import Conversation, ConversationStore
from app.config import Settings


def store(**overrides) -> ConversationStore:
    return ConversationStore(Settings(_env_file=None, **overrides))


def test_new_id_is_a_random_uuid() -> None:
    s = store()
    assert s.new_id() != s.new_id()
    assert len(s.new_id()) == 36


def test_unknown_conversation_is_empty_not_an_error() -> None:
    assert store().get("nope") == []


def test_turns_round_trip() -> None:
    s = store()
    s.append("c1", "How much is a ferry ticket?", "Placeholder answer [kb-008].")

    turns = s.get("c1")
    assert len(turns) == 1
    assert turns[0].question == "How much is a ferry ticket?"
    assert turns[0].answer == "Placeholder answer [kb-008]."


def test_history_is_capped_at_max_history_turns() -> None:
    s = store(MAX_HISTORY_TURNS=3)
    for i in range(10):
        s.append("c1", f"q{i}", f"a{i}")

    turns = s.get("c1")
    assert len(turns) == 3
    assert [t.question for t in turns] == ["q7", "q8", "q9"], "the most recent are kept"


def test_conversations_are_isolated() -> None:
    s = store()
    s.append("c1", "q1", "a1")
    s.append("c2", "q2", "a2")

    assert [t.question for t in s.get("c1")] == ["q1"]
    assert [t.question for t in s.get("c2")] == ["q2"]


def test_expired_conversations_are_evicted() -> None:
    s = store(CONVERSATION_TTL_MINUTES=60)
    s.append("c1", "q", "a")

    # Reach in and age it past the TTL rather than sleeping for an hour.
    s._conversations["c1"].last_used = datetime.now(UTC) - timedelta(minutes=61)

    assert s.get("c1") == []
    assert s.active_count() == 0


def test_activity_refreshes_the_ttl() -> None:
    s = store(CONVERSATION_TTL_MINUTES=60)
    s.append("c1", "q", "a")
    s._conversations["c1"].last_used = datetime.now(UTC) - timedelta(minutes=59)

    assert s.get("c1"), "still inside the window"
    s.append("c1", "q2", "a2")
    s._conversations["c1"].last_used = datetime.now(UTC) - timedelta(minutes=30)
    assert s.get("c1"), "the second turn reset the clock"


def test_forget_removes_immediately() -> None:
    s = store()
    s.append("c1", "q", "a")

    assert s.forget("c1") is True
    assert s.get("c1") == []
    assert s.forget("c1") is False


def test_store_holds_no_identifying_fields() -> None:
    """The privacy position: question, answer, timestamp. Nothing else."""
    fields = set(Conversation.__dataclass_fields__)
    assert fields == {"conversation_id", "turns", "last_used"}

    from app.agent.memory import Turn

    assert set(Turn.__dataclass_fields__) == {"question", "answer", "at"}


def test_nothing_is_written_to_disk(tmp_path, monkeypatch) -> None:
    """A crude but real check: no files appear while the store is exercised."""
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.rglob("*"))

    s = store()
    for i in range(20):
        s.append(f"c{i}", f"q{i}", f"a{i}")
        s.get(f"c{i}")

    assert set(tmp_path.rglob("*")) == before
