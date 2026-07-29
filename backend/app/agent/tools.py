"""The five tools the agent may use.

Exactly five, and adding a sixth needs a good argument. Every extra tool widens
the model's choice, and a wrong choice costs a round trip, tokens and latency
before it even starts being wrong.

Tool descriptions are **prompt engineering, not documentation**. The model picks
almost entirely on the docstring, so each one names the concrete topics it
covers and says when to reach for it. "Searches the knowledge base" would tell
the model nothing useful.

## Per-turn context

Tools need the request's settings, its embeddings, and somewhere to record what
they retrieved. That is held in a `ContextVar` for the duration of one turn
rather than passed through the model, because the model must never be able to
influence it. `app.rag.answer` validates the final answer against the union of
every id recorded here.
"""

import ast
import logging
import operator
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Annotated, Any

from langchain.tools import tool
from langchain_core.embeddings import Embeddings
from pydantic import BaseModel, Field

from app.agent.prompts import ESCALATION_BLOCK
from app.config import Settings, get_settings
from app.rag.retriever import RetrievedChunk, retrieve
from app.rag.store import WEB_COLLECTION, get_store, search

logger = logging.getLogger(__name__)

MAX_EXPRESSION_CHARS = 200
MAX_POW_EXPONENT = 64


@dataclass
class ToolCallRecord:
    """One tool invocation, for `tool_calls` on the response and the SSE stream."""

    name: str
    summary: str
    ms: int = 0
    ok: bool = True


@dataclass
class TurnContext:
    """State for one turn. Not visible to the model."""

    settings: Settings
    embeddings: Embeddings | None = None
    retrieved: dict[str, RetrievedChunk] = field(default_factory=dict)
    tool_calls: list[ToolCallRecord] = field(default_factory=list)

    def record_chunks(self, chunks: list[RetrievedChunk]) -> None:
        """Accumulate retrieved rows across every search in this turn.

        The union is what a citation is validated against, so a row found on the
        first tool call can still be cited after the third.
        """
        for chunk in chunks:
            self.retrieved.setdefault(chunk.id, chunk)

    @property
    def retrieved_ids(self) -> set[str]:
        return set(self.retrieved)


_turn: ContextVar[TurnContext | None] = ContextVar("turn_context", default=None)


@contextmanager
def turn_context(
    settings: Settings | None = None,
    embeddings: Embeddings | None = None,
) -> Iterator[TurnContext]:
    """Bind a fresh `TurnContext` for the duration of one turn."""
    context = TurnContext(settings=settings or get_settings(), embeddings=embeddings)
    token = _turn.set(context)
    try:
        yield context
    finally:
        _turn.reset(token)


def current_turn() -> TurnContext:
    """The active turn context.

    Raises if a tool is called outside a turn — that would mean retrieved ids
    were going unrecorded and citations could not be validated.
    """
    context = _turn.get()
    if context is None:
        raise RuntimeError("tool called outside a turn_context(); citations could not be verified")
    return context


@contextmanager
def _timed(name: str, summary: str) -> Iterator[ToolCallRecord]:
    """Record a tool call with its duration onto the turn."""
    record = ToolCallRecord(name=name, summary=summary)
    started = time.perf_counter()
    try:
        yield record
    except Exception:
        record.ok = False
        raise
    finally:
        record.ms = int((time.perf_counter() - started) * 1000)
        current_turn().tool_calls.append(record)
        logger.info("tool_call name=%s ms=%d ok=%s", record.name, record.ms, record.ok)


def _format_chunks(chunks: list[RetrievedChunk]) -> str:
    """Render retrieved rows for the model, each labelled with its citable id."""
    if not chunks:
        return "No matching rows were found. Do not invent an answer; say you do not have it."
    return "\n\n".join(f"[{c.id}] ({_provenance(c)})\n{c.text}" for c in chunks)


def _provenance(chunk: RetrievedChunk) -> str:
    """One line describing where a chunk came from and how fresh it is.

    Knowledge-base rows carry `as_of` (when a researcher verified the fact).
    Scraped pages and PDFs carry `fetched_at` instead, plus a page number for
    PDFs, so "page 34 of the Port Act" is something a person can check.
    """
    meta = chunk.metadata
    parts: list[str] = []
    if meta.get("as_of"):
        parts.append(f"verified {meta['as_of']}")
    elif meta.get("fetched_at"):
        parts.append(f"fetched {meta['fetched_at']}")
    if meta.get("page"):
        parts.append(f"page {meta['page']}")
    parts.append(f"source {meta.get('source_url', '?')}")
    return ", ".join(parts)


# --------------------------------------------------------------------- 1 of 5


@tool
def search_scaspa_knowledge(
    query: Annotated[str, "The question or topic to look up, in plain words."],
    category: Annotated[
        str | None,
        "Optional filter: ferry, cruise, cargo, airport, or general. Omit unless certain.",
    ] = None,
) -> str:
    """Search SCASPA's verified knowledge base. START HERE for almost every factual question.

    Covers:
      - Ferry sailings between St. Kitts and Nevis: departure times, fares, ticketing, luggage.
      - Cruise arrivals at Port Zante: berthing times, terminal facilities, ground transport.
      - Cargo at the Deep Water Harbour: container handling charges, gate and receiving hours,
        barrel collection, customs paperwork requirements.
      - Published seaport tariffs, harbour dues and port charges.
      - Robert L. Bradshaw International Airport: check-in guidance, parking charges, facilities.
      - SCASPA contact routes, opening hours, careers and vacancies, and published regulations.

    Every row returned carries a [kb-xxx] id and the date it was verified. You may only
    cite ids that this tool (or search_site_content) actually returned to you.

    Use this before any other tool when the user asks what something costs, when something
    runs, what is required, or who to contact. If it returns nothing useful, say so — do
    not fall back on general knowledge about how ports work elsewhere.
    """
    context = current_turn()
    summary = f"Searching SCASPA knowledge base — {query[:60]}"
    with _timed("search_scaspa_knowledge", summary):
        chunks = retrieve(
            query,
            category=category,
            embeddings=context.embeddings,
            settings=context.settings,
        )
        context.record_chunks(chunks)
        return _format_chunks(chunks)


# --------------------------------------------------------------------- 2 of 5


@tool
def search_site_content(
    query: Annotated[str, "The topic to look for in published SCASPA site material."],
) -> str:
    """Search material scraped from scaspa.com and its published PDF documents.

    Covers the things published as pages or documents rather than curated facts:
      - Press releases and news announcements.
      - Travel advisories, weather and hurricane notices, service disruptions.
      - The Port Act and other legislation and regulations.
      - Annual reports, audited financial statements and tender notices.

    Use this when the user asks about an announcement, a notice, a policy document or a
    published report — or when search_scaspa_knowledge found nothing and the answer is
    more likely to live in a document than in a curated row.

    This returns nothing until the site scraper has run. An empty result means the
    material has not been indexed, NOT that the thing does not exist. Say that you cannot
    confirm it and point the user to SCASPA rather than guessing.
    """
    context = current_turn()
    summary = f"Searching scaspa.com and published PDFs — {query[:60]}"
    with _timed("search_site_content", summary):
        store = get_store(WEB_COLLECTION, embeddings=context.embeddings, settings=context.settings)
        hits = search(store, query, k=context.settings.RETRIEVAL_TOP_K)
        chunks = [
            RetrievedChunk(
                id=doc.id or doc.metadata.get("source_url", ""),
                text=doc.page_content,
                score=doc.score,
                metadata=doc.metadata,
            )
            for doc in hits
        ]
        context.record_chunks(chunks)
        if not chunks:
            return (
                "No site content has been indexed yet. This does not mean the document "
                "does not exist — say you cannot confirm it and refer the user to SCASPA."
            )
        return _format_chunks(chunks)


# --------------------------------------------------------------------- 3 of 5


class ChartSeries(BaseModel):
    """One named series of numbers."""

    name: str
    values: list[float]


class ChartSpecModel(BaseModel):
    """Validated chart specification returned by make_chart."""

    kind: str = Field(pattern="^(bar|line|pie)$")
    title: str = Field(min_length=1)
    labels: list[str] = Field(min_length=1)
    series: list[ChartSeries] = Field(min_length=1)
    source_ids: list[str] = Field(min_length=1)


@tool
def make_chart(
    kind: Annotated[str, "One of: bar, line, pie."],
    title: Annotated[str, "A short, factual chart title."],
    labels: Annotated[list[str], "Category labels, e.g. months or years."],
    series_name: Annotated[str, "What the numbers measure, e.g. 'Cruise calls'."],
    values: Annotated[list[float], "The numbers, one per label. Must come from retrieved rows."],
    source_ids: Annotated[list[str], "The [kb-xxx] ids these numbers were taken from."],
) -> str:
    """Chart SCASPA port activity over time — cruise calls, cargo volumes, passengers by period.

    Use this ONLY when the user asks to see a trend or a comparison over time, and only
    after you have already retrieved the numbers with search_scaspa_knowledge.

    Every value you pass must appear in a row you actually retrieved this turn, and every
    id in source_ids must be one of those rows. Numbers you worked out yourself, estimated,
    or remembered are not allowed and will be rejected. If you do not have the figures,
    do not call this tool — say you do not have the data.
    """
    context = current_turn()
    summary = f"Building chart — {title[:60]}"
    with _timed("make_chart", summary):
        if len(values) != len(labels):
            return (
                f"Rejected: {len(values)} values for {len(labels)} labels. "
                "Provide exactly one value per label."
            )

        # Every figure must be traceable to a row retrieved this turn.
        unknown = [i for i in source_ids if i not in context.retrieved_ids]
        if unknown:
            return (
                f"Rejected: {', '.join(unknown)} was not retrieved this turn. "
                "Chart data must come from rows you have actually looked up. "
                "Search first, then chart."
            )

        try:
            spec = ChartSpecModel(
                kind=kind,
                title=title,
                labels=labels,
                series=[ChartSeries(name=series_name, values=values)],
                source_ids=source_ids,
            )
        except ValueError as exc:
            return f"Rejected: {exc}"

        # Prompt 8 attaches this to the response; for now it is validated and
        # reported back so the model knows it succeeded.
        return (
            f"Chart specification accepted: {spec.kind} chart "
            f"'{spec.title}' with {len(labels)} points."
        )


# --------------------------------------------------------------------- 4 of 5

_ALLOWED_BINOPS: dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_ALLOWED_UNARYOPS: dict[type, Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}
_ALLOWED_FUNCTIONS: dict[str, Any] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sum": sum,
}


class UnsafeExpressionError(ValueError):
    """The expression used something outside the whitelist."""


def _evaluate_node(node: ast.AST) -> float:
    """Evaluate one whitelisted AST node.

    Whitelist, not blacklist: anything not explicitly handled is rejected. That
    is what keeps `__import__`, attribute access, subscripting, comprehensions,
    lambdas and name lookups out, rather than trying to enumerate them.
    """
    if isinstance(node, ast.Expression):
        return _evaluate_node(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, int | float):
            raise UnsafeExpressionError("only numbers are allowed")
        return node.value

    if isinstance(node, ast.BinOp):
        op = _ALLOWED_BINOPS.get(type(node.op))
        if op is None:
            raise UnsafeExpressionError(f"operator {type(node.op).__name__} is not allowed")
        left, right = _evaluate_node(node.left), _evaluate_node(node.right)
        if op is operator.pow and abs(right) > MAX_POW_EXPONENT:
            # 9**9**9 would hang the process long before it ran out of memory.
            raise UnsafeExpressionError(f"exponent above {MAX_POW_EXPONENT} is not allowed")
        return op(left, right)

    if isinstance(node, ast.UnaryOp):
        op = _ALLOWED_UNARYOPS.get(type(node.op))
        if op is None:
            raise UnsafeExpressionError(f"operator {type(node.op).__name__} is not allowed")
        return op(_evaluate_node(node.operand))

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCTIONS:
            raise UnsafeExpressionError("only abs, round, min, max and sum may be called")
        if node.keywords:
            raise UnsafeExpressionError("keyword arguments are not allowed")
        return _ALLOWED_FUNCTIONS[node.func.id](*[_evaluate_node(a) for a in node.args])

    raise UnsafeExpressionError(f"{type(node).__name__} is not allowed")


def safe_eval(expression: str) -> float:
    """Evaluate an arithmetic expression without `eval`.

    Parses to an AST and walks it against a whitelist. There is no code path
    from here to `exec`, `eval`, an import, or attribute access.
    """
    if len(expression) > MAX_EXPRESSION_CHARS:
        raise UnsafeExpressionError(f"expression is longer than {MAX_EXPRESSION_CHARS} characters")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise UnsafeExpressionError("that is not a valid arithmetic expression") from exc
    return _evaluate_node(tree)


@tool
def calculate(
    expression: Annotated[
        str, "An arithmetic expression, e.g. '333.33 * 4' or 'round(44.44 * 2, 2)'."
    ],
) -> str:
    """Do exact arithmetic on figures you have already retrieved — never guess at a sum.

    Use it for:
      - Adding published tariffs together, e.g. a handling charge for several containers.
      - Multiplying a published fare by a number of passengers.
      - Unit conversions where both numbers are published.
      - Working out how long it is until a published departure time.

    Supports + - * / // % ** and abs, round, min, max, sum. Numbers only.

    Only ever put figures into this that came from a retrieved row. A total built from a
    number you invented is still an invented number, and quoting it would be worse than
    saying you do not know. State the published figures alongside the total, with their
    citations, so the user can check your arithmetic.
    """
    summary = f"Calculating — {expression[:60]}"
    with _timed("calculate", summary):
        try:
            result = safe_eval(expression)
        except UnsafeExpressionError as exc:
            return f"Could not calculate: {exc}. Only plain arithmetic on numbers is supported."
        except (ZeroDivisionError, OverflowError, ValueError) as exc:
            return f"Could not calculate: {exc}."
        return f"{expression} = {result}"


# --------------------------------------------------------------------- 5 of 5


@tool
def escalate_to_human() -> str:
    """Hand the user to SCASPA staff. Call whenever you cannot safely answer yourself.

    Call it for:
      - A specific shipment, container, booking, payment or account — you have no access
        to any such record and must not appear to.
      - A complaint, a dispute, or anything about a named person.
      - Anything time-critical you cannot verify: whether a ferry is sailing right now,
        whether a flight is delayed today, whether a berth or gate is currently open.
      - Customs, immigration, tax or legal advice.
      - Any question where the knowledge base has no answer and a wrong guess would leave
        someone stranded, out of pocket, or at the wrong terminal.

    Returns SCASPA's published contact details. Prefer calling this over producing a
    hedged, uncertain answer — a person with a phone number can solve their problem, and
    a plausible guess cannot.
    """
    with _timed("escalate_to_human", "Handing over to SCASPA contact details"):
        return ESCALATION_BLOCK


ALL_TOOLS = [
    search_scaspa_knowledge,
    search_site_content,
    make_chart,
    calculate,
    escalate_to_human,
]

__all__ = [
    "ALL_TOOLS",
    "ChartSpecModel",
    "ToolCallRecord",
    "TurnContext",
    "UnsafeExpressionError",
    "calculate",
    "current_turn",
    "escalate_to_human",
    "make_chart",
    "safe_eval",
    "search_scaspa_knowledge",
    "search_site_content",
    "turn_context",
]
