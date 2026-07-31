"""Agent construction and execution.

Built on LangChain v1's `create_agent`, which runs on the LangGraph runtime.
Verified against the installed package, not a tutorial:

    from langchain.agents import create_agent
    create_agent(model, tools, *, system_prompt, middleware, ...) -> CompiledStateGraph

`create_react_agent` is the v0 entry point and is not used here. The reasoning
loop is **not** hand-rolled — `create_agent` owns it, and the tool-call cap comes
from the built-in `ToolCallLimitMiddleware`.

## The cap

`AGENT_MAX_TOOL_CALLS` bounds tool calls per turn. A confused agent that loops
will spend real money quickly, so the limit is enforced by middleware rather
than by hoping the model stops.

When the cap is hit the middleware ends the run with an internal string —
measured as `"Tool call limit reached: run limit exceeded (4/3 calls)."`. That
must never reach a user, so it is detected and replaced with the ordinary
no-answer message. `tests/test_agent.py` pins that string against the real
library, so an upstream wording change fails a test instead of leaking.

## Streaming

`astream(stream_mode=["updates", "messages"])`:

* `updates` from the `model` node carrying `tool_calls` → `tool_start`
* `updates` from the `tools` node (a `ToolMessage`) → `tool_end`
* `messages` from the `model` node → answer tokens

Filtering `messages` by node matters: that mode also emits **tool output**, and
without the filter a tool's raw return value would stream to the user as if it
were the answer.
"""

import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import date

from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.graph.state import CompiledStateGraph

from app.agent.prompts import render_system_prompt
from app.agent.tools import ALL_TOOLS, RetrievedChunk, ToolCallRecord, TurnContext, turn_context
from app.config import Settings, get_settings
from app.rag.store import KB_COLLECTION, WEB_COLLECTION, get_store, search
from app.schemas import ChartSpec

logger = logging.getLogger(__name__)

# Emitted by ToolCallLimitMiddleware when the run limit is hit. Pinned by a test
# against the real library so a wording change is caught here, not in production.
TOOL_LIMIT_MARKER = "Tool call limit reached"

# The agent retrieves via tools, so there is no single context block to inject.
# The prompt still needs its {context} placeholder filled.
AGENT_CONTEXT_NOTE = (
    "You have search tools. Nothing has been retrieved for you in advance — call "
    "search_scaspa_knowledge first for any factual question. You may only cite ids that a "
    "tool actually returned to you during this conversation."
)


@dataclass
class AgentTurnResult:
    """Everything one agent turn produced, before citation validation."""

    answer: str
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    retrieved: dict[str, RetrievedChunk] = field(default_factory=dict)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model_calls: int = 0
    hit_tool_limit: bool = False
    chart: ChartSpec | None = None


def build_agent(
    settings: Settings | None = None,
    chat_model: BaseChatModel | None = None,
    today: date | None = None,
) -> CompiledStateGraph:
    """Build the agent: settings-supplied model, the five tools, the system prompt.

    `{current_date}` is injected per request, so this is built per turn rather
    than cached.
    """
    settings = settings or get_settings()
    if chat_model is None:
        from app.rag.answer import build_chat_model

        chat_model = build_chat_model(settings)

    system_prompt = render_system_prompt(
        context=AGENT_CONTEXT_NOTE,
        current_date=(today or date.today()).isoformat(),
    )

    return create_agent(
        chat_model,
        ALL_TOOLS,
        system_prompt=system_prompt,
        middleware=[
            ToolCallLimitMiddleware(
                run_limit=settings.AGENT_MAX_TOOL_CALLS,
                exit_behavior="end",
            )
        ],
    )


def best_available_score(
    query: str,
    settings: Settings,
    embeddings: Embeddings | None = None,
) -> float:
    """Best similarity across both collections, without invoking the model.

    A cheap pre-flight probe that preserves the low-confidence short-circuit from
    the fixed chain: a question nothing can answer costs one embedding call, not
    a whole agent turn.

    Both collections are checked deliberately. Probing only the knowledge base
    would wrongly refuse questions about press releases and published documents
    once the scraper fills `scaspa_web` in Prompt 6.
    """
    best = 0.0
    for collection in (KB_COLLECTION, WEB_COLLECTION):
        try:
            store = get_store(collection, embeddings=embeddings, settings=settings)
            hits = search(store, query, k=1)
        except Exception:  # noqa: BLE001 — a missing collection must not break the probe
            logger.debug("probe_failed collection=%s", collection, exc_info=True)
            continue
        if hits:
            best = max(best, hits[0].score)
    return best


def message_text(content: object) -> str:
    """The plain text of a model message, whichever shape it arrived in.

    `content` is a string on `/v1/chat/completions` and a list of typed blocks
    on `/v1/responses` — `[{"type": "text", "text": "..."}, ...]`, with reasoning
    and tool blocks mixed in. The previous `str(content)` fallback turned the
    second case into a Python `repr` and put `[{'type': 'text', ...}]` in front
    of a user as the answer, which no test would have caught because the fixture
    models all return strings.

    Only `text` blocks are joined. A reasoning block is the model's private
    working and must never be shown.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            block["text"]
            for block in content
            if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
        ]
        return "".join(parts)
    return ""


def _accumulate_usage(message: AIMessage, result: AgentTurnResult) -> None:
    """Add one model response's token usage to the running totals."""
    usage = getattr(message, "usage_metadata", None) or {}
    result.prompt_tokens += usage.get("input_tokens", 0) or 0
    result.completion_tokens += usage.get("output_tokens", 0) or 0
    result.model_calls += 1


def log_turn(query: str, result: AgentTurnResult, latency_ms: int) -> None:
    """Per-turn cost and latency line.

    Question text and latency are logged; no identifiers — CLAUDE.md rule 9.
    """
    logger.info(
        "agent_turn question=%r tool_calls=%d tools=%s model_calls=%d "
        "prompt_tokens=%d completion_tokens=%d total_tokens=%d latency_ms=%d "
        "hit_tool_limit=%s retrieved=%d",
        query,
        len(result.tool_calls),
        [t.name for t in result.tool_calls],
        result.model_calls,
        result.prompt_tokens,
        result.completion_tokens,
        result.prompt_tokens + result.completion_tokens,
        latency_ms,
        result.hit_tool_limit,
        len(result.retrieved),
    )


def _finish(context: TurnContext, answer: str, result: AgentTurnResult) -> AgentTurnResult:
    """Copy turn state onto the result and apply the cap substitution."""
    result.tool_calls = list(context.tool_calls)
    result.retrieved = dict(context.retrieved)
    # Taken from the turn, not from model output: make_chart already validated
    # every figure against a retrieved row.
    result.chart = context.chart
    if answer.startswith(TOOL_LIMIT_MARKER):
        result.hit_tool_limit = True
        result.answer = ""
        logger.warning(
            "tool_limit_hit tool_calls=%d — returning the no-answer message",
            len(result.tool_calls),
        )
    else:
        result.answer = answer
    return result


def run_agent(
    query: str,
    *,
    settings: Settings | None = None,
    chat_model: BaseChatModel | None = None,
    embeddings: Embeddings | None = None,
    today: date | None = None,
    category: str | None = None,
) -> AgentTurnResult:
    """Run one agent turn synchronously.

    `category` is the caller's retrieval filter from the request body. It is put
    on the turn rather than into the prompt, so the model cannot argue with it.
    """
    settings = settings or get_settings()
    started = time.perf_counter()
    result = AgentTurnResult(answer="")

    with turn_context(settings=settings, embeddings=embeddings, category=category) as context:
        agent = build_agent(settings, chat_model, today)
        state = agent.invoke({"messages": [{"role": "user", "content": query}]})

        for message in state["messages"]:
            if isinstance(message, AIMessage):
                _accumulate_usage(message, result)

        final = state["messages"][-1]
        _finish(context, message_text(final.content), result)

    log_turn(query, result, int((time.perf_counter() - started) * 1000))
    return result


async def arun_agent(
    query: str,
    *,
    settings: Settings | None = None,
    chat_model: BaseChatModel | None = None,
    embeddings: Embeddings | None = None,
    today: date | None = None,
    category: str | None = None,
) -> AsyncIterator[tuple[str, dict]]:
    """Run one agent turn, streaming events.

    Yields `("tool_start" | "tool_end" | "token", payload)` as they happen, then
    a final `("_result", {"result": AgentTurnResult})` for the caller to verify.
    The leading underscore marks it as internal — it is never sent to a client.
    """
    settings = settings or get_settings()
    started = time.perf_counter()
    result = AgentTurnResult(answer="")
    pieces: list[str] = []
    pending: dict[str, str] = {}

    with turn_context(settings=settings, embeddings=embeddings, category=category) as context:
        agent = build_agent(settings, chat_model, today)

        async for mode, chunk in agent.astream(
            {"messages": [{"role": "user", "content": query}]},
            stream_mode=["updates", "messages"],
        ):
            if mode == "updates":
                for node, update in (chunk or {}).items():
                    for message in (update or {}).get("messages", []) or []:
                        if isinstance(message, AIMessage):
                            _accumulate_usage(message, result)
                            for call in message.tool_calls or []:
                                summary = _summarise(call["name"], call.get("args") or {})
                                pending[call["id"]] = summary
                                yield "tool_start", {"name": call["name"], "summary": summary}
                        elif isinstance(message, ToolMessage) and node == "tools":
                            record = _record_for(context, message.name)
                            yield (
                                "tool_end",
                                {
                                    "name": message.name,
                                    "summary": pending.pop(
                                        message.tool_call_id,
                                        _summarise(message.name or "", {}),
                                    ),
                                    "ms": record.ms if record else 0,
                                },
                            )
            else:
                message, metadata = chunk
                # Only the model node produces answer text. Without this filter a
                # tool's raw output would stream to the user as the answer.
                if metadata.get("langgraph_node") != "model":
                    continue
                text = message_text(message.content)
                if text:
                    pieces.append(text)
                    yield "token", {"text": text}

        _finish(context, "".join(pieces), result)

    log_turn(query, result, int((time.perf_counter() - started) * 1000))
    yield "_result", {"result": result}


def _record_for(context: TurnContext, name: str | None) -> ToolCallRecord | None:
    """Most recent completed record for a tool, for its measured duration."""
    for record in reversed(context.tool_calls):
        if record.name == name:
            return record
    return None


def _summarise(name: str, args: dict) -> str:
    """A short human-readable line the frontend can render directly."""
    query = str(args.get("query") or "").strip()
    match name:
        case "search_scaspa_knowledge":
            topic = f" — {query[:60]}" if query else ""
            return f"Searching SCASPA knowledge base{topic}"
        case "search_site_content":
            topic = f" — {query[:60]}" if query else ""
            return f"Searching scaspa.com and published PDFs{topic}"
        case "make_chart":
            title = str(args.get("title") or "").strip()
            return f"Building chart{f' — {title[:60]}' if title else ''}"
        case "calculate":
            expression = str(args.get("expression") or "").strip()
            return f"Calculating{f' — {expression[:60]}' if expression else ''}"
        case "escalate_to_human":
            return "Handing over to SCASPA contact details"
        case _:
            return f"Running {name}"


__all__ = [
    "TOOL_LIMIT_MARKER",
    "AgentTurnResult",
    "arun_agent",
    "best_available_score",
    "build_agent",
    "run_agent",
]
