"""The contract between this API and the frontend, asserted rather than assumed.

`docs/api-contract.md` is prose, and prose does not fail a build. Every check
here corresponds to a line in that file that the frontend reads and depends on:
a field it renders, an event it parses, a header it must be able to read. When
one of these fails, the contract file is wrong or the backend is — and either
way it is caught here rather than as an `undefined` in a fee table.

The frontend mirrors of these are in `frontend/src/lib/types.ts` and
`frontend/src/lib/schemas.ts`.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.agent import graph as graph_module
from app.agent.memory import ConversationStore, get_conversation_store
from app.agent.tools import ALL_TOOLS
from app.config import get_settings
from app.errors import ErrorCode
from app.main import EXPOSED_HEADERS, create_app
from app.rag import answer as answer_module
from app.rag.answer import kb_label_and_snippet, truncate_on_word
from app.rag.ingest import build_kb_index
from app.rag.retriever import RetrievedChunk
from app.schemas import CATEGORIES
from tests.scripted_model import searches_then_says

ANSWER = "The placeholder one-way fare is XCD 44.44 for an adult ticket [kb-008]."

# The five tool names the contract publishes so a client can pick an icon per
# name. Mirrored in the frontend's `ToolName`.
CONTRACT_TOOL_NAMES = {
    "search_scaspa_knowledge",
    "search_site_content",
    "make_chart",
    "calculate",
    "escalate_to_human",
}

# Every error code the contract's table lists. The frontend switches on these.
CONTRACT_ERROR_CODES = {
    "VALIDATION_ERROR",
    "INDEX_MISSING",
    "RETRIEVAL_EMPTY",
    "RATE_LIMITED",
    "UPSTREAM_RATE_LIMITED",
    "UPSTREAM_TIMEOUT",
    "NOT_FOUND",
    "INTERNAL",
}

CITATION_FIELDS = {
    "kb_id",
    "category",
    "subcategory",
    "source_url",
    "source_type",
    "as_of",
    "confidence",
    "volatility",
    "label",
    "snippet",
}

DONE_FIELDS = {"latency_ms", "grounded", "refusal", "refusal_category", "kb_version"}


@pytest.fixture
def api(tmp_settings, sample_csv, fake_embeddings, monkeypatch):
    """A TestClient over the fixture index, with no network anywhere."""
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )

    def fake_llm(settings=None):  # noqa: ANN001, ARG001
        return searches_then_says(ANSWER, query="ferry fares")

    monkeypatch.setattr(answer_module, "build_chat_model", fake_llm)
    monkeypatch.setattr(graph_module, "build_chat_model", fake_llm, raising=False)

    import app.rag.store as store_module

    monkeypatch.setattr(store_module, "build_embeddings", lambda settings=None: fake_embeddings)

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: tmp_settings
    app.dependency_overrides[get_conversation_store] = lambda: ConversationStore(tmp_settings)
    return TestClient(app)


def read_events(response) -> list[tuple[str, dict]]:  # noqa: ANN001
    """Parse an SSE body into (event, payload) pairs."""
    events: list[tuple[str, dict]] = []
    for block in response.text.split("\n\n"):
        name = data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                data = line.removeprefix("data: ")
        if name and data is not None:
            events.append((name, json.loads(data)))
    return events


# ------------------------------------------------------------------ citations


def test_a_citation_carries_every_documented_field(api) -> None:
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()

    assert body["citations"], "the fixture answer cites kb-008"
    assert set(body["citations"][0]) == CITATION_FIELDS


def test_volatility_comes_from_the_row_and_is_never_guessed(api) -> None:
    """The client shows or hides "confirm before you travel" on this value.

    A missing volatility must arrive as null so the client can apply its own
    cautious default. Inventing "low" here would quietly downgrade a schedule
    nobody has classified.
    """
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    citation = body["citations"][0]

    # kb-008 is ferry/fares, classified medium in the fixture CSV.
    assert citation["volatility"] == "medium"


def test_label_and_snippet_come_verbatim_from_the_indexed_row(api) -> None:
    body = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    citation = body["citations"][0]

    assert citation["label"] == "How much is a ferry ticket?"
    assert citation["snippet"].startswith("SAMPLE DATA")
    assert "XCD 44.44" in citation["snippet"]


def test_a_snippet_is_never_cut_through_a_figure() -> None:
    """CLAUDE.md rule 10, applied to the excerpt as well as the answer.

    Truncating `XCD 44.44` to `XCD 44.4` would put a wrong fare directly under an
    answer the reader has been asked to trust. Cutting only at whitespace makes
    that impossible.
    """
    text = "The fare is XCD 44.44 for one adult"
    for limit in range(1, len(text) + 4):
        snippet = truncate_on_word(text, limit).rstrip("…")
        assert "44.4" not in snippet or "44.44" in snippet


def test_a_scraped_page_yields_a_title_and_no_invented_excerpt() -> None:
    """A web chunk has no curated question or answer, so neither is fabricated."""
    web = RetrievedChunk(
        id="https://example.invalid/notice",
        text="Some free-form page text with no Question or Answer structure.",
        score=0.8,
        metadata={"title": "Service notice", "source_kind": "website"},
    )

    label, snippet = kb_label_and_snippet(web)

    assert label == "Service notice"
    assert snippet is None


# --------------------------------------------------------------------- stream


def test_the_done_event_carries_refusal_category(api) -> None:
    """A streamed refusal must be able to pick the same copy the JSON one can."""
    response = api.post("/api/chat/stream", json={"message": "where is my container?"})
    name, done = read_events(response)[-1]

    assert name == "done"
    assert set(done) == DONE_FIELDS
    assert done["refusal"] is True
    assert done["refusal_category"] == "personal_record"


def test_both_endpoints_agree_on_refusal_category(api) -> None:
    question = {"message": "where is my container?"}

    posted = api.post("/api/chat", json=question).json()
    _, done = read_events(api.post("/api/chat/stream", json=question))[-1]

    assert posted["refusal_category"] == done["refusal_category"]


def test_stream_citations_carry_the_same_fields_as_the_json_endpoint(api) -> None:
    events = read_events(api.post("/api/chat/stream", json={"message": "ferry fares"}))
    citations = next(data["citations"] for name, data in events if name == "citations")

    assert citations, "the fixture answer cites kb-008"
    assert set(citations[0]) == CITATION_FIELDS


# --------------------------------------------------------------------- headers


def test_retry_after_is_readable_by_a_browser() -> None:
    """Not a formality: an unexposed Retry-After makes the countdown a guess.

    Node ignores CORS, so an integration script reads the header either way and
    this only ever shows up in a browser. Asserting the configuration is the only
    way to catch it here.
    """
    assert "Retry-After" in EXPOSED_HEADERS
    assert "X-Request-ID" in EXPOSED_HEADERS
    assert "X-TTS-Cache" in EXPOSED_HEADERS


def test_cors_actually_advertises_the_exposed_headers(api) -> None:
    response = api.post(
        "/api/chat",
        json={"message": "How much is a ferry ticket?"},
        headers={"Origin": "http://localhost:5173"},
    )
    exposed = response.headers.get("access-control-expose-headers", "")

    for header in EXPOSED_HEADERS:
        assert header in exposed


# -------------------------------------------------------------------- category


@pytest.mark.parametrize("category", CATEGORIES)
def test_every_documented_category_is_accepted(api, category: str) -> None:
    response = api.post(
        "/api/chat", json={"message": "How much is a ferry ticket?", "category": category}
    )

    assert response.status_code == 200


def test_an_unknown_category_is_a_422_not_a_silent_no_answer(api) -> None:
    """A category filter is an equality on metadata, so a typo matches no row.

    Without this the caller gets a confident "I do not have that" for a question
    the knowledge base answers — the worst possible failure mode for a typo.
    """
    response = api.post(
        "/api/chat", json={"message": "How much is a ferry ticket?", "category": "ferries"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_the_request_category_beats_the_one_the_model_picks(monkeypatch) -> None:
    """The caller's filter is a constraint; the model's argument is a guess.

    This is the case an end-to-end test cannot see. A fake model passes no
    category, so either precedence looks correct — but a *real* model asked "how
    much is a ferry ticket?" confidently passes `category="ferry"`, and if its
    argument wins, an `airport` filter set by the caller silently does nothing at
    exactly the moment it was set deliberately. Measured against the live model
    before this test existed.
    """
    from app.agent import tools as tools_module

    seen: dict[str, str | None] = {}

    def spy(query, **kwargs):  # noqa: ANN001, ANN202, ARG001
        seen["category"] = kwargs.get("category")
        return []

    monkeypatch.setattr(tools_module, "retrieve", spy)

    with tools_module.turn_context(category="airport"):
        tools_module.search_scaspa_knowledge.invoke(
            {"query": "how much is a ferry ticket?", "category": "ferry"}
        )

    assert seen["category"] == "airport"


def test_the_model_still_chooses_when_the_caller_did_not(monkeypatch) -> None:
    """No request category means the model's own filter is the only one there is."""
    from app.agent import tools as tools_module

    seen: dict[str, str | None] = {}

    def spy(query, **kwargs):  # noqa: ANN001, ANN202, ARG001
        seen["category"] = kwargs.get("category")
        return []

    monkeypatch.setattr(tools_module, "retrieve", spy)

    with tools_module.turn_context():
        tools_module.search_scaspa_knowledge.invoke({"query": "ferry fares", "category": "ferry"})

    assert seen["category"] == "ferry"


def test_the_category_filter_reaches_retrieval(api) -> None:
    """Filtering to the wrong area must change the answer, or it is not applied.

    kb-008 is a ferry row. Asking the same question filtered to `airport` must
    not return it — which is only true if the request's category survives all the
    way into the search tool.
    """
    unfiltered = api.post("/api/chat", json={"message": "How much is a ferry ticket?"}).json()
    assert [c["kb_id"] for c in unfiltered["citations"]] == ["kb-008"]

    filtered = api.post(
        "/api/chat",
        json={"message": "How much is a ferry ticket?", "category": "airport"},
    ).json()

    assert "kb-008" not in [c["kb_id"] for c in filtered["citations"]]


# --------------------------------------------------------------- conversation


def test_a_malformed_conversation_id_is_replaced_not_adopted(api) -> None:
    body = api.post(
        "/api/chat",
        json={"message": "How much is a ferry ticket?", "conversation_id": "../../etc/passwd"},
    ).json()

    assert body["conversation_id"] != "../../etc/passwd"


def test_a_well_formed_id_is_still_honoured(api) -> None:
    """Two workers do not share a store, so an id this process has not seen is
    still legitimate — membership cannot be the test, only shape."""
    offered = "00000000-0000-4000-8000-000000000000"
    body = api.post(
        "/api/chat",
        json={"message": "How much is a ferry ticket?", "conversation_id": offered},
    ).json()

    assert body["conversation_id"] == offered


# ------------------------------------------------------------- names and codes


def test_the_agent_exposes_exactly_the_documented_tool_names() -> None:
    """The frontend maps an icon per name and the contract lists five.

    A sixth tool is a contract change, not an implementation detail.
    """
    assert {tool.name for tool in ALL_TOOLS} == CONTRACT_TOOL_NAMES


def test_the_error_codes_are_exactly_the_documented_set() -> None:
    assert {code.value for code in ErrorCode} == CONTRACT_ERROR_CODES
