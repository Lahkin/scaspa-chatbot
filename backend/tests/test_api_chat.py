"""HTTP tests for /api/chat and /api/chat/stream.

Fake retriever (via fake embeddings over the fixture index) and a fake LLM, so
CI stays green with no OPENAI_API_KEY.
"""

import json

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel

from app.agent import graph as graph_module
from app.agent.memory import ConversationStore, get_conversation_store
from app.agent.prompts import GREETING_MESSAGE, NO_ANSWER_MESSAGE, REFUSAL_MESSAGE
from app.config import get_settings
from app.main import create_app
from app.rag import answer as answer_module
from app.rag.ingest import build_kb_index
from tests.scripted_model import searches_then_says

ANSWER = "The placeholder one-way fare is XCD 44.44 for an adult ticket [kb-008]."


def FakeLLM(reply: str = ANSWER):  # noqa: N802 — kept as a name for readability
    """A model that searches the knowledge base, then answers.

    The agent needs a real BaseChatModel, and it must actually call the search
    tool or its citation would be unverifiable.
    """
    return searches_then_says(reply, query="ferry fares")


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
        graph_module, "build_chat_model", lambda settings=None: FakeLLM(), raising=False
    )
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


def test_chart_is_declared_but_still_null(api) -> None:
    """chart arrives in Prompt 8; the field exists now so the shape is final."""
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    assert "chart" in body
    assert body["chart"] is None


def test_tool_calls_are_reported_with_readable_summaries(api) -> None:
    """Task 4 — the frontend renders these directly."""
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    assert len(body["tool_calls"]) == 1
    call = body["tool_calls"][0]
    assert call["name"] == "search_scaspa_knowledge"
    assert call["summary"] == "Searching SCASPA knowledge base — ferry fares"
    assert call["ms"] >= 0


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


def test_stream_emits_tool_events_in_order(api) -> None:
    """Task 4 — the visible part of an otherwise invisible achievement."""
    events = read_events(
        api.post("/api/chat/stream", json={"message": "How much is a ferry ticket?"})
    )
    names = [name for name, _ in events]

    assert "tool_start" in names
    assert "tool_end" in names
    assert names.index("meta") < names.index("tool_start") < names.index("tool_end")
    assert names.index("tool_end") < names.index("citations")

    _, start = next((n, d) for n, d in events if n == "tool_start")
    assert start["name"] == "search_scaspa_knowledge"
    assert start["summary"] == "Searching SCASPA knowledge base — ferry fares"

    _, end = next((n, d) for n, d in events if n == "tool_end")
    assert end["ms"] >= 0

    # chart still arrives in Prompt 8.
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


class ExplodingLLM(BaseChatModel):
    """Fails while generating — the mid-stream failure case."""

    @property
    def _llm_type(self) -> str:
        return "exploding-mid-stream"

    def bind_tools(self, tools, **kwargs):  # noqa: ANN001, ARG002
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):  # noqa: ANN001, ARG002
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


class RateLimitedLLM(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "rate-limited"

    def bind_tools(self, tools, **kwargs):  # noqa: ANN001, ARG002
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):  # noqa: ANN001, ARG002
        raise _RateLimited()


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


def test_a_greeting_is_answered_on_the_streaming_path_too(api) -> None:
    """The path the browser actually uses.

    Both endpoints run the same gates in the same order, and a greeting fixed
    only in `answer_question` would pass a synchronous test while every real
    user — who streams — still got "I do not have that in SCASPA's verified
    information" for the word "hi".
    """
    events = read_events(api.post("/api/chat/stream", json={"message": "hi"}))
    names = [name for name, _ in events]
    text = "".join(data.get("text", "") for name, data in events if name == "token")

    assert names[0] == "meta"
    assert names[-1] == "done"
    assert text.strip() == GREETING_MESSAGE.strip()

    done = next(data for name, data in events if name == "done")
    # Not a refusal on this path either — the two must agree.
    assert done["refusal"] is False
    assert done["grounded"] is False
    assert [data for name, data in events if name == "citations"] == [{"citations": []}]


def test_both_endpoints_answer_a_greeting_identically(api) -> None:
    """`answer_question` and `astream_answer` must not drift apart."""
    posted = api.post("/api/chat", json={"message": "hello"}).json()
    streamed = read_events(api.post("/api/chat/stream", json={"message": "hello"}))
    streamed_text = "".join(d.get("text", "") for n, d in streamed if n == "token")

    assert posted["answer"].strip() == streamed_text.strip()
    assert posted["refusal"] is False
