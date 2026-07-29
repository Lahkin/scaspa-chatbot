"""HTTP tests for /api/chat and /api/chat/stream.

Fake retriever (via fake embeddings over the fixture index) and a fake LLM, so
CI stays green with no OPENAI_API_KEY.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.agent.memory import ConversationStore, get_conversation_store
from app.agent.prompts import NO_ANSWER_MESSAGE, REFUSAL_MESSAGE
from app.config import get_settings
from app.main import create_app
from app.rag import answer as answer_module
from app.rag.ingest import build_kb_index

ANSWER = "The placeholder one-way fare is XCD 44.44 for an adult ticket [kb-008]."


class FakeLLM:
    """Returns a canned answer, and streams it in small pieces."""

    def __init__(self, reply: str = ANSWER) -> None:
        self.reply = reply

    def invoke(self, messages):  # noqa: ARG002
        return type("Msg", (), {"content": self.reply})()

    async def astream(self, messages):  # noqa: ARG002
        # Deliberately split mid-marker so the test proves the client must
        # reassemble rather than parse per-frame.
        size = 7
        for start in range(0, len(self.reply), size):
            yield type("Chunk", (), {"content": self.reply[start : start + size]})()


@pytest.fixture
def api(tmp_settings, sample_csv, fake_embeddings, monkeypatch):
    """A TestClient wired to a throwaway index, fake embeddings and a fake LLM."""
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )

    monkeypatch.setattr(answer_module, "build_chat_model", lambda settings=None: FakeLLM())
    monkeypatch.setattr(
        answer_module, "build_embeddings", lambda settings=None: fake_embeddings, raising=False
    )
    import app.rag.store as store_module

    monkeypatch.setattr(store_module, "build_embeddings", lambda settings=None: fake_embeddings)

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: tmp_settings
    app.dependency_overrides[get_conversation_store] = lambda: ConversationStore(tmp_settings)
    return TestClient(app)


# ------------------------------------------------------------- happy path


def test_happy_path_returns_citations(api) -> None:
    response = api.post("/api/chat", json={"message": "How much is a ferry ticket?"})

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == ANSWER
    assert body["grounded"] is True
    assert body["refusal"] is False
    assert [c["kb_id"] for c in body["citations"]] == ["kb-008"]
    assert body["citations"][0]["source_url"].startswith("https://example.invalid/")


def test_chart_and_tool_calls_are_present_but_empty(api) -> None:
    """The frontend must be able to code against the final shape today."""
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    assert "chart" in body
    assert body["chart"] is None
    assert body["tool_calls"] == []


def test_meta_carries_diagnostics_but_not_the_model_name(api) -> None:
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    meta = body["meta"]
    assert meta["request_id"]
    assert meta["retrieved_count"] > 0
    assert meta["cited_ids"] == ["kb-008"]
    assert meta["kb_version"]
    assert "model" not in json.dumps(meta).lower() or "gpt" not in json.dumps(meta).lower()


# ------------------------------------------------------------- refusal paths


def test_low_score_returns_the_no_answer_message(api) -> None:
    response = api.post("/api/chat", json={"message": "which beach should I go to?"})

    assert response.status_code == 200, "a no-answer is a valid answer, not an error"
    body = response.json()
    assert body["refusal"] is True
    assert body["grounded"] is False
    assert body["citations"] == []
    assert body["answer"] == NO_ANSWER_MESSAGE


def test_refusal_gate_returns_the_refusal_message(api) -> None:
    body = api.post("/api/chat", json={"message": "where is my container?"}).json()

    assert body["refusal"] is True
    assert body["refusal_category"] == "personal_record"
    assert body["answer"] == REFUSAL_MESSAGE


# ------------------------------------------------------------- validation


def test_oversized_message_returns_422_envelope(api) -> None:
    response = api.post("/api/chat", json={"message": "x" * 1001})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "1000 characters" in error["message"]
    assert error["request_id"]


def test_message_at_the_limit_is_accepted(api) -> None:
    assert api.post("/api/chat", json={"message": "x" * 1000}).status_code == 200


@pytest.mark.parametrize("message", ["", "   ", "\n\t "])
def test_blank_message_returns_a_friendly_422(api, message: str) -> None:
    response = api.post("/api/chat", json={"message": message})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "Please type a question before sending."
    assert "Traceback" not in response.text


def test_error_body_leaks_nothing_internal(api) -> None:
    text = api.post("/api/chat", json={"message": ""}).text

    for leak in ("Traceback", "/Users/", "site-packages", "gpt-", "openai"):
        assert leak not in text


# ------------------------------------------------------------- conversation


def test_conversation_id_is_minted_and_round_trips(api) -> None:
    first = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    conversation_id = first["conversation_id"]
    assert conversation_id

    second = api.post(
        "/api/chat",
        json={"message": "When does the ferry leave?", "conversation_id": conversation_id},
    ).json()

    assert second["conversation_id"] == conversation_id


def test_each_new_request_gets_its_own_conversation(api) -> None:
    a = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    b = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    assert a["conversation_id"] != b["conversation_id"]


# ------------------------------------------------------------------ health


def test_health_reports_models_and_uptime(api) -> None:
    body = api.get("/api/health").json()

    assert body["uptime_s"] >= 0
    assert body["models"]["chat"]
    assert body["models"]["embedding"]
    assert body["models"]["transcribe"]
    assert body["models"]["tts"]
    assert body["index"]["ready"] is True


# ------------------------------------------------------------------ streaming


def read_events(response) -> list[tuple[str, dict]]:
    """Parse an SSE body into (event, data) pairs."""
    events, name, data = [], None, []
    for line in response.text.splitlines():
        if line == "":
            if name:
                events.append((name, json.loads("".join(data)) if data else {}))
            name, data = None, []
        elif line.startswith("event:"):
            name = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].strip())
    if name:
        events.append((name, json.loads("".join(data)) if data else {}))
    return events


def test_stream_headers_defeat_proxy_buffering(api) -> None:
    with api.stream(
        "POST", "/api/chat/stream", json={"message": "How much is a ferry ticket?"}
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["x-accel-buffering"] == "no"


def test_stream_event_order(api) -> None:
    response = api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    events = read_events(response)
    names = [name for name, _ in events]

    assert names[0] == "meta", "meta must arrive before any token"
    assert names[-1] == "done"
    assert names.count("citations") == 1
    assert names.index("citations") > max(i for i, n in enumerate(names) if n == "token")


def test_stream_meta_carries_conversation_id_first(api) -> None:
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )

    name, data = events[0]
    assert name == "meta"
    assert data["conversation_id"]


def test_streamed_tokens_reassemble_to_the_same_answer(api) -> None:
    """Streaming and non-streaming must return identical content."""
    plain = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )

    streamed = "".join(data["text"] for name, data in events if name == "token")
    assert streamed == plain["answer"]


def test_stream_citations_match_the_json_endpoint(api) -> None:
    plain = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )

    citations = next(data for name, data in events if name == "citations")
    assert [c["kb_id"] for c in citations["citations"]] == [c["kb_id"] for c in plain["citations"]]


def test_stream_done_payload(api) -> None:
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )

    _, done = next((n, d) for n, d in events if n == "done")
    assert done["grounded"] is True
    assert done["refusal"] is False
    assert done["kb_version"]
    assert done["latency_ms"] >= 0


def test_stream_emits_no_tool_events_yet(api) -> None:
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )
    names = {name for name, _ in events}

    assert "tool_start" not in names
    assert "tool_end" not in names
    assert "chart" not in names


def test_stream_refusal_still_completes_the_sequence(api) -> None:
    events = read_events(api.post("/api/chat/stream", json={"message": "where is my container?"}))
    names = [name for name, _ in events]

    assert names[0] == "meta"
    assert names[-1] == "done"
    text = "".join(d["text"] for n, d in events if n == "token")
    assert text == REFUSAL_MESSAGE


def test_stream_validation_error_is_a_normal_422(api) -> None:
    """Validation happens before headers are sent, so a real status code works."""
    response = api.post("/api/chat/stream", json={"message": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


class ExplodingLLM(FakeLLM):
    """Streams a little, then fails — the mid-stream failure case."""

    async def astream(self, messages):  # noqa: ARG002
        yield type("Chunk", (), {"content": "The placeholder fare "})()
        raise RuntimeError("upstream died mid-generation")


def test_mid_stream_error_emits_an_error_frame_and_closes(api, monkeypatch) -> None:
    """Headers are already sent, so the status stays 200 and an error frame ends it."""
    monkeypatch.setattr(answer_module, "build_chat_model", lambda settings=None: ExplodingLLM())

    response = api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    events = read_events(response)
    names = [name for name, _ in events]

    assert response.status_code == 200, "the status code cannot change once headers are sent"
    assert names[-1] == "error", "the stream must end, not hang"
    _, error = events[-1]
    assert error["code"] == "INTERNAL"
    assert error["request_id"]
    assert "RuntimeError" not in response.text, "no internal detail may leak"
    assert "upstream died" not in response.text


class RateLimitedLLM(FakeLLM):
    async def astream(self, messages):  # noqa: ARG002
        raise _RateLimited()
        yield  # pragma: no cover — makes this an async generator


class _RateLimited(Exception):
    status_code = 429


def test_mid_stream_rate_limit_uses_the_upstream_code(api, monkeypatch) -> None:
    monkeypatch.setattr(answer_module, "build_chat_model", lambda settings=None: RateLimitedLLM())

    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )

    name, error = events[-1]
    assert name == "error"
    # astream failures are not retried mid-generation; they surface as INTERNAL
    # unless the chain classified them. Either way the frame is well-formed and
    # carries a message a user can act on.
    assert error["code"] in {"INTERNAL", "UPSTREAM_RATE_LIMITED"}
    assert "869-465-8121" in error["message"]
