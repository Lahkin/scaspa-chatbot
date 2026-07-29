"""Agent tests: tool choice, the cap, multi-tool citation validation, cost logging.

No API key needed — the model is scripted.
"""

import logging

import pytest

from app.agent.graph import TOOL_LIMIT_MARKER, arun_agent, build_agent, run_agent
from app.agent.prompts import ESCALATION_BLOCK, NO_ANSWER_MESSAGE
from app.agent.tools import ALL_TOOLS
from app.rag.answer import answer_question
from app.rag.ingest import build_kb_index
from tests.scripted_model import AlwaysCallsTool, says, scripted, tool_call


@pytest.fixture
def indexed(sample_csv, tmp_settings, fake_embeddings):
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )
    return tmp_settings


# ------------------------------------------------------------------- wiring


def test_exactly_five_tools() -> None:
    """More tools means more confusion, latency and cost. Five is the budget."""
    assert len(ALL_TOOLS) == 5
    assert {t.name for t in ALL_TOOLS} == {
        "search_scaspa_knowledge",
        "search_site_content",
        "make_chart",
        "calculate",
        "escalate_to_human",
    }


@pytest.mark.parametrize("tool_obj", ALL_TOOLS, ids=lambda t: t.name)
def test_tool_descriptions_are_prompt_engineering(tool_obj) -> None:
    """A description the model cannot choose on is a failing description."""
    description = tool_obj.description
    assert len(description) > 200, "too short to guide a choice between five tools"
    assert description != "Searches the knowledge base."


def test_agent_builds_with_the_five_tools(indexed) -> None:
    agent = build_agent(indexed, chat_model=scripted(says("hi")))

    assert agent is not None


# --------------------------------------------------------------- tool choice


def test_agent_calls_a_tool_and_answers(indexed, fake_embeddings) -> None:
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry fare"}),
        says("The placeholder fare is XCD 44.44 [kb-008]."),
    )

    result = run_agent(
        "How much is a ferry ticket?",
        settings=indexed,
        chat_model=model,
        embeddings=fake_embeddings,
    )

    assert [t.name for t in result.tool_calls] == ["search_scaspa_knowledge"]
    assert "kb-008" in result.retrieved
    assert result.answer.startswith("The placeholder fare")


def test_tool_summaries_are_human_readable(indexed, fake_embeddings) -> None:
    """The frontend renders these directly, so they must read as English."""
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry schedules"}),
        says("Answer [kb-008]."),
    )

    result = run_agent("q", settings=indexed, chat_model=model, embeddings=fake_embeddings)

    assert result.tool_calls[0].summary == "Searching SCASPA knowledge base — ferry schedules"


def test_escalate_returns_the_contact_block(indexed, fake_embeddings) -> None:
    model = scripted(tool_call("escalate_to_human"), says("Please contact SCASPA."))

    result = run_agent("q", settings=indexed, chat_model=model, embeddings=fake_embeddings)

    assert [t.name for t in result.tool_calls] == ["escalate_to_human"]


def test_site_search_is_empty_but_does_not_break(indexed, fake_embeddings) -> None:
    """scaspa_web has no documents until Prompt 6."""
    model = scripted(
        tool_call("search_site_content", {"query": "press release"}),
        says("I cannot confirm that."),
    )

    result = run_agent("q", settings=indexed, chat_model=model, embeddings=fake_embeddings)

    assert [t.name for t in result.tool_calls] == ["search_site_content"]
    assert result.retrieved == {}


# ----------------------------------------------- multi-tool citation validity


def test_citations_validate_across_several_tool_calls(indexed, fake_embeddings) -> None:
    """The union of every search's ids is the valid set — Task 3."""
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry"}, "c1"),
        tool_call("search_scaspa_knowledge", {"query": "airport parking"}, "c2"),
        says("Ferry [kb-008]. Parking [kb-011]."),
    )

    result = answer_question(
        "ferry fare and airport parking",
        settings=indexed,
        chat_model=model,
        embeddings=fake_embeddings,
    )

    cited = {c.kb_id for c in result.citations}
    assert "kb-008" in cited, "an id from the FIRST call must still be citable after the second"
    assert "kb-011" in cited
    assert result.hallucinated_citations == []


def test_citation_never_retrieved_is_still_stripped(indexed, fake_embeddings, caplog) -> None:
    """Agency does not relax the rule — CLAUDE.md rule 4."""
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry"}),
        says("Ferries sail hourly [kb-777]."),
    )

    with caplog.at_level(logging.WARNING):
        result = answer_question(
            "ferry times", settings=indexed, chat_model=model, embeddings=fake_embeddings
        )

    assert "[kb-777]" not in result.answer
    assert result.hallucinated_citations == ["kb-777"]
    assert result.grounded is False
    assert "hallucinated_citation" in caplog.text


def test_citing_without_searching_is_rejected(indexed, fake_embeddings) -> None:
    """An agent that skips its tools has retrieved nothing, so can cite nothing."""
    model = scripted(says("The fare is XCD 44.44 [kb-008]."))

    result = answer_question(
        "ferry fare", settings=indexed, chat_model=model, embeddings=fake_embeddings
    )

    assert result.citations == []
    assert result.hallucinated_citations == ["kb-008"]
    assert result.grounded is False


# -------------------------------------------------------------------- the cap


def test_tool_limit_marker_still_matches_the_library(indexed, fake_embeddings) -> None:
    """Pin the upstream string. If LangChain rewords it, fail here, not in production."""
    settings = indexed.model_copy(update={"AGENT_MAX_TOOL_CALLS": 2})
    agent = build_agent(settings, chat_model=AlwaysCallsTool(state={}))

    from app.agent.tools import turn_context

    with turn_context(settings=settings, embeddings=fake_embeddings):
        state = agent.invoke({"messages": [{"role": "user", "content": "go"}]})

    assert state["messages"][-1].content.startswith(TOOL_LIMIT_MARKER)


def test_runaway_agent_is_capped(indexed, fake_embeddings) -> None:
    settings = indexed.model_copy(update={"AGENT_MAX_TOOL_CALLS": 3})

    result = run_agent(
        "go", settings=settings, chat_model=AlwaysCallsTool(state={}), embeddings=fake_embeddings
    )

    assert result.hit_tool_limit is True
    assert len(result.tool_calls) <= settings.AGENT_MAX_TOOL_CALLS


def test_capped_turn_returns_the_no_answer_message(indexed, fake_embeddings) -> None:
    """Never a partial answer and never the library's raw internal string."""
    settings = indexed.model_copy(update={"AGENT_MAX_TOOL_CALLS": 2})

    result = answer_question(
        "ferry fare",
        settings=settings,
        chat_model=AlwaysCallsTool(state={}),
        embeddings=fake_embeddings,
    )

    assert result.answer == NO_ANSWER_MESSAGE
    assert ESCALATION_BLOCK in result.answer
    assert TOOL_LIMIT_MARKER not in result.answer
    assert result.hit_tool_limit is True
    assert result.refusal is True
    assert result.citations == []


# ------------------------------------------------------------ cost + latency


def test_turn_logs_tools_tokens_and_latency(indexed, fake_embeddings, caplog) -> None:
    """Task 5 — the numbers behind the cost slide."""
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry"}),
        says("Answer [kb-008]."),
    )

    with caplog.at_level(logging.INFO):
        run_agent("q", settings=indexed, chat_model=model, embeddings=fake_embeddings)

    line = next(m for m in caplog.messages if m.startswith("agent_turn"))
    for field in (
        "tool_calls=1",
        "tools=['search_scaspa_knowledge']",
        "prompt_tokens=",
        "completion_tokens=",
        "total_tokens=",
        "latency_ms=",
    ):
        assert field in line


def test_token_counts_accumulate_across_model_calls(indexed, fake_embeddings) -> None:
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry"}),
        says("Answer [kb-008]."),
    )

    result = run_agent("q", settings=indexed, chat_model=model, embeddings=fake_embeddings)

    assert result.model_calls == 2
    assert result.prompt_tokens == 200, "100 per model call, two calls"
    assert result.completion_tokens == 40


# ---------------------------------------------------------------- streaming


async def collect(query: str, settings, model, embeddings) -> list[tuple[str, dict]]:
    return [
        event
        async for event in arun_agent(
            query, settings=settings, chat_model=model, embeddings=embeddings
        )
    ]


async def test_stream_emits_tool_start_and_tool_end(indexed, fake_embeddings) -> None:
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry fares"}),
        says("The fare is XCD 44.44 [kb-008]."),
    )

    events = await collect("ferry fare", indexed, model, fake_embeddings)
    names = [name for name, _ in events]

    assert "tool_start" in names
    assert "tool_end" in names
    assert names.index("tool_start") < names.index("tool_end")

    _, start = next((n, d) for n, d in events if n == "tool_start")
    assert start["name"] == "search_scaspa_knowledge"
    assert start["summary"] == "Searching SCASPA knowledge base — ferry fares"

    _, end = next((n, d) for n, d in events if n == "tool_end")
    assert end["name"] == "search_scaspa_knowledge"
    assert "ms" in end


async def test_stream_does_not_leak_tool_output_as_answer_tokens(indexed, fake_embeddings) -> None:
    """`messages` mode also emits tool results; they must be filtered out."""
    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "ferry"}),
        says("The fare is XCD 44.44 [kb-008]."),
    )

    events = await collect("ferry fare", indexed, model, fake_embeddings)
    streamed = "".join(d["text"] for n, d in events if n == "token")

    assert streamed == "The fare is XCD 44.44 [kb-008]."
    assert "Category:" not in streamed, "a raw chunk would contain the chunk header"
    assert "verified 2026" not in streamed
