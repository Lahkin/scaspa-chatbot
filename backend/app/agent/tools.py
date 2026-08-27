"""The six tools the agent may use.

Adding a seventh needs a good argument. Every extra tool widens
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
import re
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any

from langchain.tools import tool
from langchain_core.embeddings import Embeddings
from pydantic import ValidationError

from app.agent.prompts import ESCALATION_BLOCK
from app.config import Settings, get_settings
from app.rag.retriever import RetrievedChunk, retrieve
from app.rag.store import WEB_COLLECTION, get_store, search
from app.schemas import CardRequest, ChartPoint, ChartSeries, ChartSpec

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
    # The caller's `category` from the request body, if it sent one. Applied when
    # the model does not name a category itself: a client that knows it is the
    # ferry widget is more reliable than a keyword classifier, and without this
    # the documented request field would reach the router and stop there.
    category: str | None = None
    retrieved: dict[str, RetrievedChunk] = field(default_factory=dict)
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    # Set by make_chart after validation. The model never sees or edits this
    # object, so it cannot alter a chart once the figures have been checked.
    chart: "ChartSpec | None" = None
    # Set by show_card. Holds only the *request* — a kind and a filter. The rows
    # are filled in from the operational feed by `app.ops.cards`, so nothing the
    # model wrote reaches them.
    card: "CardRequest | None" = None

    # Text a tool produced that figures may be VERIFIED against, but which is
    # not a citable knowledge-base row.
    #
    # The distinction is the point. `retrieved` holds rows with kb ids: an
    # answer may cite them, and the citation chain checks it did. This holds
    # operational text from a structured source — the published cruise
    # schedule — which has no kb id and must never be given one.
    #
    # Without it the numeric grounding gate discarded every cruise answer, and
    # correctly: a sailing time from a tool it had never heard of is exactly
    # the unverifiable figure that gate exists to stop. The fix is to tell the
    # gate where the figure came from, not to weaken it.
    evidence: list[str] = field(default_factory=list)

    def record_evidence(self, text: str) -> None:
        """Register tool output as something figures may be checked against."""
        if text:
            self.evidence.append(text)

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
    category: str | None = None,
) -> Iterator[TurnContext]:
    """Bind a fresh `TurnContext` for the duration of one turn."""
    context = TurnContext(
        settings=settings or get_settings(),
        embeddings=embeddings,
        category=category,
    )
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
            # The request's category wins over the model's.
            #
            # It is a constraint, not a hint: a caller that sends `airport` is a
            # widget embedded on the airport page, and it is asking not to be
            # answered from ferry rows. The model's own argument is a guess made
            # from the question text, and it *will* guess "ferry" for "how much
            # is a ferry ticket?" — so letting it win means the filter silently
            # does nothing exactly when it was set deliberately.
            category=context.category or category,
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


# Wording in a source row that means the figures are not authoritative. If the
# row says this, the caption must say it too.
_ILLUSTRATIVE_MARKERS = (
    "sample data",
    "placeholder",
    "illustrative",
    "estimate",
    "estimated",
    "approx",
    "not real",
    "fictional",
    "example only",
)
_ILLUSTRATIVE_CAPTION_WORDS = (
    "illustrative",
    "illustration",
    "estimate",
    "estimated",
    "approximate",
    "sample",
    "placeholder",
    "not real",
)


def number_forms(value: float) -> list[str]:
    """Every way a figure might legitimately be written in a row.

    `12407059` could appear as `12407059` or `12,407,059`; `44.0` as `44` or
    `44.0`. Checking only one spelling would reject figures that really are in
    the source, which would push the agent toward not charting at all.
    """
    forms: list[str] = []
    if value == int(value):
        whole = int(value)
        forms += [str(whole), f"{whole:,}", f"{whole}.0", f"{whole:,}.0"]
    else:
        text = f"{value:g}"
        forms.append(text)
        forms.append(f"{value:,.2f}")
        forms.append(f"{value:.2f}")
        if "." in text:
            integer_part, decimal_part = text.split(".", 1)
            forms.append(f"{int(integer_part):,}.{decimal_part}")
    # Longest first, so 44.44 is tried before 44.
    return sorted(dict.fromkeys(forms), key=len, reverse=True)


def figure_in_text(value: float, text: str) -> bool:
    """Whether `value` appears in `text` as a complete figure.

    Lookarounds, not a substring test. `44` is a substring of `44.44`, and
    accepting that would let a chart claim a fare of 44 from a row that says
    44.44 — the same trap the rule-10 verbatim check hit.
    """
    for form in number_forms(value):
        if re.search(rf"(?<![\d.,]){re.escape(form)}(?![\d.,]?\d)", text):
            return True
    return False


@tool
def make_chart(
    chart_type: Annotated[str, "One of: line, bar, area. Nothing else is supported."],
    title: Annotated[str, "A short, factual chart title."],
    x_label: Annotated[str, "X axis label, e.g. 'Month' or 'Container size'."],
    y_label: Annotated[str, "Y axis label including units, e.g. 'Passengers' or 'XCD'."],
    series_name: Annotated[str, "What the numbers measure, e.g. 'Cruise passengers'."],
    x_values: Annotated[list[str], "Category labels, one per number. Max 40."],
    y_values: Annotated[list[float], "The figures. Each MUST appear in the source row."],
    caption: Annotated[
        str,
        "Required. Must say whether the figures are official/published or illustrative/estimated.",
    ],
    source_kb_id: Annotated[str, "The single [kb-xxx] row these figures came from."],
) -> str:
    """Describe a chart of SCASPA activity over time — passengers, vessel calls, tonnage, tariffs.

    You do not draw the chart. You describe it, and the interface renders it.

    Use this ONLY when the user asks to see a trend or a comparison, and ONLY after
    search_scaspa_knowledge has returned a row that actually contains the figures.

    Every number you pass is checked against the text of the row you name in
    source_kb_id. A figure that is not in that row is rejected — including one you
    worked out, converted, rounded or remembered. There is no way to chart a number
    the knowledge base does not contain, and that is deliberate: an invented tariff
    drawn as a confident bar chart is the most dangerous thing this assistant could
    produce, because someone will budget against it.

    If you do not have the figures, do not call this tool. Say you do not have the data.
    """
    context = current_turn()
    summary = f"Building chart — {title[:60]}"
    with _timed("make_chart", summary):
        if len(y_values) != len(x_values):
            return (
                f"Rejected: {len(y_values)} values for {len(x_values)} labels. "
                "Provide exactly one value per label."
            )

        # --- 1. the source row must have been retrieved this turn ---
        chunk = context.retrieved.get(source_kb_id)
        if chunk is None:
            available = ", ".join(sorted(context.retrieved_ids)) or "nothing yet"
            return (
                f"Rejected: {source_kb_id} was not retrieved this turn. "
                f"Search first with search_scaspa_knowledge, then chart from a row it "
                f"returned. Rows retrieved so far: {available}."
            )

        # --- 2. every figure must appear in that row's text ---
        missing = [v for v in y_values if not figure_in_text(v, chunk.text)]
        # A numeric x value is a figure too.
        for raw in x_values:
            try:
                numeric = float(str(raw).replace(",", ""))
            except ValueError:
                continue
            if not figure_in_text(numeric, chunk.text):
                missing.append(numeric)

        if missing:
            shown = ", ".join(f"{v:g}" for v in dict.fromkeys(missing))
            logger.warning("chart_rejected_ungrounded source=%s missing=%s", source_kb_id, shown)
            return (
                f"Rejected: {shown} does not appear in {source_kb_id}. You may only chart "
                f"figures that are present in the knowledge base. Do not calculate, convert, "
                f"round or estimate a value for a chart — if the figure is not in a retrieved "
                f"row, say you do not have the data instead."
            )

        # --- 3. a caption is mandatory ---
        # Checked before the illustrative rule so an empty caption is told it is
        # missing, rather than being told to mention "illustrative".
        if not caption.strip():
            return (
                "Rejected: a caption is required. It must state whether the figures are "
                "official/published or illustrative/estimated — a reader cannot tell from "
                "the chart alone."
            )

        # --- 4. an illustrative source needs an illustrative caption ---
        row_text = chunk.text.lower()
        if any(marker in row_text for marker in _ILLUSTRATIVE_MARKERS) and not any(
            word in caption.lower() for word in _ILLUSTRATIVE_CAPTION_WORDS
        ):
            return (
                f"Rejected: {source_kb_id} contains illustrative or estimated figures, so the "
                "caption must say so. Rewrite the caption to state that the figures are "
                "illustrative, not official."
            )

        try:
            spec = ChartSpec(
                type=chart_type,
                title=title,
                x_label=x_label,
                y_label=y_label,
                series=[
                    ChartSeries(
                        name=series_name,
                        points=[
                            ChartPoint(x=x, y=y) for x, y in zip(x_values, y_values, strict=True)
                        ],
                    )
                ],
                caption=caption,
                source=source_kb_id,
            )
        except ValidationError as exc:
            reasons = "; ".join(
                f"{'.'.join(str(p) for p in e['loc'])}: {e['msg'].removeprefix('Value error, ')}"
                for e in exc.errors()
            )
            return f"Rejected: {reasons}"

        # Held on the turn, not returned as text. The router attaches it to the
        # response, so the model cannot alter it after validation.
        context.chart = spec
        return (
            f"Chart accepted: {spec.type} chart '{spec.title}' with "
            f"{len(spec.series[0].points)} points from {source_kb_id}. "
            "It will be rendered for the user; describe it briefly in your answer."
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


# --------------------------------------------------------------------- 6 of 6


@tool
def show_card(
    card: Annotated[
        str,
        "One of: vessel_arrivals, flight_schedules, tariff_calculator, support_ticket.",
    ],
    direction: Annotated[
        str | None, "For flight_schedules only: 'arrival' or 'departure'. Default arrival."
    ] = None,
    department: Annotated[
        str | None, "For support_ticket only: which SCASPA desk the query belongs to."
    ] = None,
    subject: Annotated[
        str | None,
        "For support_ticket only: a one-line summary of the user's question, for them to edit.",
    ] = None,
) -> str:
    """Attach a card below your answer: an arrivals board, the fee calculator, or a ticket form.

    Use it when the interface can do something you cannot:

      - `vessel_arrivals` / `flight_schedules` — the user asked what is arriving.
        You cannot see live operations and must not say what is on the board; this
        shows them the board itself, with its own source and timestamp attached.
        Say that you cannot see live movements, then attach this.
      - `tariff_calculator` — the user wants to know what something will cost and
        you do not have a single published figure that answers it. You must never
        estimate a fee. The calculator applies published rates and shows its own
        warning, so offer it instead of guessing.
      - `support_ticket` — you could not answer, or the question needs a person.
        Pass `department` and a one-line `subject` summarising what they asked.

    **You supply no data.** There is no parameter for a vessel name, an ETA, a
    berth, a flight status, a rate or a total, and there will not be. The rows are
    read from SCASPA's own feed after you finish, and the card states where they
    came from and how old they are. That is what makes attaching one honest while
    describing one in a sentence is not.

    One card per answer; the last call wins. Do not attach a card the user did not
    ask for — an arrivals board under a question about baggage is clutter.
    """
    context = current_turn()
    kind = card.strip().lower()
    allowed = {"vessel_arrivals", "flight_schedules", "tariff_calculator", "support_ticket"}

    summary = f"Preparing card — {kind}"
    with _timed("show_card", summary):
        if kind not in allowed:
            return f"Rejected: {card!r} is not a card. Choose one of: {', '.join(sorted(allowed))}."
        try:
            request = CardRequest(
                kind=kind,  # type: ignore[arg-type]  — validated against `allowed` above
                direction=direction if direction in {"arrival", "departure"} else None,
                department=department,
                subject=subject,
            )
        except ValidationError as exc:
            return f"Rejected: {exc.errors()[0]['msg']}"

        # Held on the turn, not returned as text. The router fills in the rows
        # from the feed, so the model cannot influence them after this point.
        context.card = request
        return (
            f"Card accepted: a {kind} card will be shown below your answer, with its own "
            "source and date. Do not describe its contents — the user can read it."
        )


@tool
def get_cruise_schedule(
    when: Annotated[
        str,
        "today, tomorrow, week, or a single date as YYYY-MM-DD. Use week for vague "
        "questions like 'this week' or 'what is coming'.",
    ] = "week",
    vessel: Annotated[
        str,
        "Optional vessel name to filter by, e.g. 'Allure'. Leave empty for all calls.",
    ] = "",
) -> str:
    """Cruise calls SCASPA has published for Port Zante and the piers.

    **Use this instead of search_scaspa_knowledge for any question about which ships
    are arriving, when, or how many passengers.** The knowledge base holds explanatory
    material about the cruise terminal; this holds the actual schedule, as rows, from
    SCASPA's own published source.

    Returns the calls with the date the schedule was last retrieved. Quote that date —
    the schedule is fetched periodically and is not a live feed.

    **An empty result is a real answer.** There are days with no cruise ship in port,
    and saying so is correct. Do not fall back to searching the knowledge base for a
    schedule it does not contain, and never estimate an arrival.
    """
    label = (when or "week").strip().lower()
    name = (vessel or "").strip()

    with _timed(
        "get_cruise_schedule",
        f"Reading the published SCASPA cruise schedule — {label}" + (f", {name}" if name else ""),
    ):
        from app.ops import cruise

        today = datetime.now(UTC).date()
        if label == "today":
            since = until = today
        elif label == "tomorrow":
            since = until = today + timedelta(days=1)
        elif label == "week":
            since, until = today, today + timedelta(days=7)
        else:
            try:
                since = until = date.fromisoformat(label)
            except ValueError:
                # A date the model invented a format for. Widen rather than
                # guess: a week of real calls answers the question, where a
                # coerced date could answer a different one confidently.
                since, until = today, today + timedelta(days=7)

        result = cruise.schedule(since=since, until=until, vessel=name or None, limit=40)

        if result.source.kind == "unavailable":
            return (
                "The published cruise schedule has not been retrieved yet, so there is "
                "nothing to report. Say so and offer SCASPA's contact details."
            )

        checked = (
            result.source.as_of.strftime("%d %b %Y at %H:%M UTC")
            if result.source.as_of
            else "an unknown time"
        )
        page = cruise.source_page()

        if not result.calls:
            empty = (
                f"SCASPA has published NO cruise calls for {label} "
                f"({since.isoformat()} to {until.isoformat()}). This is a real answer, not a "
                f"failure — tell the user there are none scheduled. "
                f"Source: Official SCASPA cruise schedule, checked {checked}. {page}"
            )
            # The checked date is a figure the answer is required to quote,
            # so the grounding gate has to have seen it.
            current_turn().record_evidence(empty)
            return empty

        lines = []
        for call in result.calls:
            pax = (
                f"{call.pax} passengers"
                if call.pax is not None
                else "passenger count not published"
            )
            lines.append(
                f"- {call.call_date.isoformat()} ({call.day}) {call.window}: {call.vessel}"
                f" — {call.cruise_line}, pier {call.pier}, {pax}"
            )

        more = (
            f"\n({result.total} calls match in total; the first {len(result.calls)} are listed.)"
            if result.total > len(result.calls)
            else ""
        )
        listed = "\n".join(lines)
        answer = (
            f"Published SCASPA cruise calls for {label}:\n"
            + listed
            + more
            + f"\n\nSource: Official SCASPA cruise schedule, checked {checked}. {page}\n"
            + "This is published information retrieved periodically, NOT a live feed. "
            + "Quote the checked date in your answer."
        )
        # ── EVERY FIGURE HERE MUST BE VERIFIABLE ───────────────────────
        #
        # Dates, sailing windows and passenger counts are exactly the
        # values the numeric grounding gate discards an answer for when it
        # cannot find them. Before this line it could not: the gate reads
        # retrieved knowledge-base rows, and these came from a structured
        # source it had never heard of, so every cruise answer was replaced
        # by the "could not verify" message. Recording the tool's own
        # output tells the gate where the figures came from rather than
        # weakening it.
        current_turn().record_evidence(answer)
        return answer


ALL_TOOLS = [
    search_scaspa_knowledge,
    get_cruise_schedule,
    search_site_content,
    make_chart,
    calculate,
    escalate_to_human,
    show_card,
]

__all__ = [
    "ALL_TOOLS",
    "ChartSpec",
    "ToolCallRecord",
    "TurnContext",
    "UnsafeExpressionError",
    "calculate",
    "current_turn",
    "escalate_to_human",
    "get_cruise_schedule",
    "make_chart",
    "safe_eval",
    "search_scaspa_knowledge",
    "search_site_content",
    "show_card",
    "turn_context",
]
