"""The answer chain: retrieve → format context → call the model → verify.

A fixed chain, not an agent. Every step is explicit and inspectable, which is
what makes the guarantees below testable.

## The guarantee

The model is never trusted about what it cited. It is asked to cite (see
`app.agent.prompts`), and then this module checks. Specifically:

* Citation markers are parsed out of the answer text and validated against the
  ids that were *actually retrieved*.
* Any id the model produced that was not retrieved is **stripped from the text**,
  logged as `hallucinated_citation`, and forces `grounded=False`.
* The returned `citations` array is built from the retrieved chunks' stored
  metadata — never from the model's output text. A model cannot talk its way
  into a citation; it can only select from what it was given.

## The short-circuit

If the best retrieval score is below `RETRIEVAL_MIN_SCORE`, the model is not
called at all. Nothing is generated, so nothing can be hallucinated. This is
cheaper, faster and structurally safe rather than merely well-behaved.

CLAUDE.md rule 4: the backend never lets the LLM produce a citation it has not
verified against a retrieved knowledge-base row.
"""

import logging
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.agent.graph import AgentTurnResult, arun_agent, best_available_score, run_agent
from app.agent.prompts import (
    CLOSING_MESSAGE,
    CONTEXT_CHUNK_TEMPLATE,
    ESCALATION_BLOCK,
    GREETING_MESSAGE,
    NO_ANSWER_MESSAGE,
    REFUSAL_MESSAGE,
    UNGROUNDED_NUMBER_MESSAGE,
    render_system_prompt,
)
from app.config import Settings, get_settings
from app.rag.grounding import check_numbers
from app.rag.retriever import RetrievedChunk
from app.schemas import CardRequest, ChartSpec
from app.upstream import call_with_retry

logger = logging.getLogger(__name__)

# Matches the citation marker the prompt asks for, e.g. [kb-014] or [kb-0142].
# Deliberately the same shape as the id validator in app.rag.models.
CITATION_PATTERN = re.compile(r"\[(kb-\d{3,4})\]")

# CLAUDE.md rule 10: money and time values in an answer must appear verbatim in
# a retrieved chunk. A valid citation only proves the *row* exists — it does not
# prove the figure in the sentence came from that row. A model can cite kb-008
# correctly and still round its fare, convert its currency, or reformat 04:04 as
# "around 4am". These patterns catch that.
MONEY_PATTERN = re.compile(
    r"(?:XCD|EC\$|US\$|USD|\$)\s?\d[\d,]*(?:\.\d{1,2})?"
    r"|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:XCD|USD|EC dollars?|dollars?)\b",
    re.IGNORECASE,
)
TIME_PATTERN = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?)\b", re.IGNORECASE)


class Citation(BaseModel):
    """A verified citation.

    Every field is copied from the stored metadata of a chunk that was actually
    retrieved. None of it comes from model output.
    """

    kb_id: str
    category: str = ""
    subcategory: str = ""
    source_url: str = ""
    source_type: str = ""
    as_of: str = ""
    confidence: str = ""
    volatility: str | None = None
    label: str | None = None
    snippet: str | None = None


class ToolCallInfo(BaseModel):
    """One tool the agent used, as shown to the client."""

    name: str
    summary: str = ""
    ms: int = 0


class AnswerResult(BaseModel):
    """Outcome of one question. Maps onto the eventual ChatResponse."""

    answer: str
    grounded: bool = Field(description="True only if every claim carries a verified citation")
    refusal: bool = Field(description="True when the chain declined without calling the model")
    refusal_category: str | None = Field(
        default=None, description="Which refusal gate fired, if any"
    )
    citations: list[Citation] = Field(default_factory=list)
    retrieved: list[RetrievedChunk] = Field(default_factory=list)
    cited_ids: list[str] = Field(default_factory=list)
    hallucinated_citations: list[str] = Field(
        default_factory=list, description="Ids the model produced that were never retrieved"
    )
    unverified_figures: list[str] = Field(
        default_factory=list,
        description="Money/time values in the answer found in no retrieved chunk (rule 10)",
    )
    ungrounded_numbers: list[str] = Field(
        default_factory=list,
        description="Figures that failed the numeric grounding gate; the answer was replaced",
    )
    answer_replaced: bool = Field(
        default=False, description="True when the generated answer was discarded as ungrounded"
    )
    tool_calls: list[ToolCallInfo] = Field(
        default_factory=list, description="Tools the agent used, in order"
    )
    prompt_tokens: int = 0
    completion_tokens: int = 0
    hit_tool_limit: bool = False
    chart: ChartSpec | None = Field(
        default=None, description="Validated chart spec, or None. Never built from model text"
    )
    card: CardRequest | None = Field(
        default=None,
        description="The card the model asked for, unpopulated. Rows come from the feed",
    )
    best_score: float = 0.0
    model: str | None = None
    latency_ms: int = 0


def format_context(chunks: list[RetrievedChunk]) -> str:
    """Render retrieved chunks into the CONTEXT block.

    Each chunk is labelled with its id so the model has something real to cite,
    and carries its `as_of` date so the model can satisfy the schedule rule.
    """
    return "\n\n".join(
        CONTEXT_CHUNK_TEMPLATE.format(
            id=chunk.id,
            category=chunk.metadata.get("category", ""),
            as_of=chunk.metadata.get("as_of", ""),
            source_url=chunk.metadata.get("source_url", ""),
            text=chunk.text,
        )
        for chunk in chunks
    )


def extract_citations(text: str) -> list[str]:
    """Every citation marker in the text, in order of appearance, deduplicated."""
    seen: dict[str, None] = {}
    for match in CITATION_PATTERN.finditer(text):
        seen.setdefault(match.group(1), None)
    return list(seen)


def strip_citation(text: str, kb_id: str) -> str:
    """Remove every marker for `kb_id`, tidying the whitespace it leaves behind."""
    cleaned = re.sub(rf"\s*\[{re.escape(kb_id)}\]", "", text)
    # Collapse doubled spaces and fix a space that ended up before punctuation.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return re.sub(r" +([.,;:!?])", r"\1", cleaned)


def verify_citations(text: str, retrieved_ids: set[str]) -> tuple[str, list[str], list[str]]:
    """Validate the model's citations against what was actually retrieved.

    Returns `(clean_text, verified_ids, hallucinated_ids)`. Any id not in
    `retrieved_ids` is removed from the text — a marker pointing at a row the
    backend never saw is worse than no marker, because it looks authoritative.
    """
    verified: list[str] = []
    hallucinated: list[str] = []

    for kb_id in extract_citations(text):
        if kb_id in retrieved_ids:
            verified.append(kb_id)
        else:
            hallucinated.append(kb_id)
            text = strip_citation(text, kb_id)

    return text.strip(), verified, hallucinated


# Deterministic refusal gate — defence in depth, not a replacement for rule 5.
#
# Stress-testing showed the backend cannot detect a *false claim wearing a valid
# citation*: an adversarial model answered "use VHF channel 16 [kb-005]" citing a
# genuinely retrieved row, with no money or time value to check, and every
# backend check passed it. For safety-critical categories, hoping the model obeys
# the prompt is not good enough, so these questions never reach the model at all.
#
# Deliberately narrow, to limit over-refusal. Customs and duty are *not* here:
# kb-006 legitimately covers which documents are needed to clear cargo, and a
# keyword filter on "customs" would block a question the knowledge base answers.
# Those stay with prompt rule 5.
REFUSAL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "vessel_or_aircraft_operations",
        re.compile(
            r"\b(?:radio\s+frequenc|vhf|call\s+sign|channel\s+\d+"
            r"|berthing\s+(?:instruction|guidance|procedure)"
            r"|approach\s+(?:instruction|guidance)|mooring\s+instruction)",
            re.IGNORECASE,
        ),
    ),
    (
        "personal_record",
        re.compile(
            r"\b(?:where\s+is\s+my|track\s+my|status\s+of\s+my)\b"
            r"|\bmy\s+(?:container|shipment|consignment|cargo|booking|payment|account)\b",
            re.IGNORECASE,
        ),
    ),
)


def match_refusal_category(query: str) -> str | None:
    """Return the refusal category this question falls into, if any.

    A hit means the question is answered from `REFUSAL_MESSAGE` without calling
    the model.
    """
    for category, pattern in REFUSAL_PATTERNS:
        if pattern.search(query):
            return category
    return None


# A greeting is not a question, and the pipeline had nowhere to put one.
#
# Before this gate existed there were exactly two pre-model outcomes: refuse a
# boundary question, or report that nothing in the corpus answers it. "hi" is
# neither. It fell through to the retrieval probe, embedded to a best score of
# 0.12, and came back as NO_ANSWER_MESSAGE — "I do not have that in SCASPA's
# verified information, so I will not guess at it" — followed by a telephone
# number. The first word anyone types, answered as a failed lookup.
#
# **Anchored end to end, and that is the whole safety argument.** The pattern
# matches only when the entire message is a pleasantry, so anything carrying a
# question rides straight past it into the normal path:
#
#     "hi"                          -> greeting
#     "hi there"                    -> greeting
#     "hi, how much is a container" -> NOT a greeting; retrieved and answered
#     "good morning"                -> greeting
#     "what are your opening hours" -> NOT a greeting
#
# The failure mode to avoid is a greeting gate that swallows a real question
# because it happened to start politely, which would be a far worse defect than
# the one being fixed: it would silently stop answering.
#
# Closings are here for the same reason openings are. "thanks" is the second
# thing people type, and it failed identically.
_GREETING_WORDS = (
    r"hi|hii+|hey+|hello|hiya|howdy|yo|greetings|"
    r"good\s+(?:morning|afternoon|evening|day)|"
    r"how\s+are\s+you|how(?:'s|\s+is)\s+it\s+going|what's\s+up"
)
_CLOSING_WORDS = r"thanks?|thank\s+you|thanks\s+a\s+lot|cheers|bye|goodbye|good\s?bye|see\s+you"


def _anchored(words: str) -> re.Pattern[str]:
    return re.compile(
        rf"^[\s!.,]*(?:{words})"
        # Trailing address or filler only — "hi there", "hello again". Anything
        # else, including any question, means this is not merely a pleasantry.
        r"(?:\s+(?:there|again|all|team|folks|everyone|so\s+much|a\s+lot))?"
        r"[\s!.,?]*$",
        re.IGNORECASE,
    )


GREETING_PATTERN = _anchored(_GREETING_WORDS)
CLOSING_PATTERN = _anchored(_CLOSING_WORDS)


def is_conversational_opener(query: str) -> bool:
    """True when the message is a pleasantry and nothing else.

    Deliberately conservative: a message containing a question is never an
    opener, however politely it begins.
    """
    return bool(GREETING_PATTERN.match(query) or CLOSING_PATTERN.match(query))


def conversational_reply(query: str) -> str | None:
    """The reply for a pleasantry, or `None` if this is a real question.

    Greetings and closings are split because they are the same routing problem
    and different words: answering "thank you" with "Hello. I answer questions
    about SCASPA…" is its own small wrongness.
    """
    if CLOSING_PATTERN.match(query):
        return CLOSING_MESSAGE
    if GREETING_PATTERN.match(query):
        return GREETING_MESSAGE
    return None


def find_unverified_figures(text: str, chunks: list[RetrievedChunk]) -> list[str]:
    """Money and time values in `text` that appear in no retrieved chunk.

    CLAUDE.md rule 10. Matching is verbatim by design: a rounded fare, a
    converted currency or a reformatted sailing time is exactly the failure this
    is meant to catch, and each of those changes the string.

    Returns the offending values. An empty list means every figure in the answer
    was traceable to a retrieved chunk.
    """
    haystack = "\n".join(chunk.text for chunk in chunks)
    found: dict[str, None] = {}

    for pattern in (MONEY_PATTERN, TIME_PATTERN):
        for match in pattern.finditer(text):
            value = match.group(0).strip()
            if not _appears_verbatim(value, haystack):
                found.setdefault(value, None)

    return list(found)


def _appears_verbatim(value: str, haystack: str) -> bool:
    """Whether `value` occurs in `haystack` as a complete figure.

    A plain substring test is not enough, and getting this wrong defeats the
    whole check: "XCD 44" is a substring of "XCD 44.44", and "4:04" of "04:04".
    Both are exactly the rounding and reformatting rule 10 exists to catch, and
    both would have passed. The lookarounds require the value not to be a
    fragment of a longer number.
    """
    pattern = re.compile(rf"(?<![\d.]){re.escape(value)}(?![\d.]?\d)")
    return bool(pattern.search(haystack))


# The `label` and `snippet` on a citation come from the chunk's own text rather
# than from its Chroma metadata. `app.rag.chunking.build_kb_text` writes every
# row in this fixed shape, so the two lines below are exactly the row's stored
# `question` and `answer` — no less verbatim than a metadata copy would be, and
# available against an index that was built before these fields existed. A
# scraped web chunk has no such structure and simply yields None for both.
_KB_QUESTION_LINE = re.compile(r"^Question:[ \t]*(.+)$", re.MULTILINE)
_KB_ANSWER_BLOCK = re.compile(
    r"^Answer:[ \t]*(.*?)(?=\n(?:Also known as:)|\Z)", re.MULTILINE | re.DOTALL
)

# Long enough to tell two fare rows apart, short enough not to reprint the answer
# underneath the answer.
SNIPPET_MAX_CHARS = 180


def truncate_on_word(text: str, limit: int = SNIPPET_MAX_CHARS) -> str:
    """Shorten `text` to `limit` characters, cutting only at whitespace.

    The whitespace rule is not cosmetic. A mid-token cut would turn `XCD 44.44`
    into `XCD 44.4` — a figure that is wrong, looks deliberate, and appears
    directly under an answer the reader has been asked to trust. Cutting between
    tokens can only ever drop a whole word.
    """
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    head = collapsed[:limit]
    cut = head.rfind(" ")
    # A single token longer than the limit has no safe cut, so drop the snippet
    # rather than publish a fragment of it.
    if cut <= 0:
        return ""
    return f"{head[:cut].rstrip()}…"


def kb_label_and_snippet(chunk: RetrievedChunk) -> tuple[str | None, str | None]:
    """A human-readable label for this source, and a short excerpt of it.

    For a knowledge-base row that is the stored `question` and `answer`. A
    scraped page has neither, so it falls back to its `title` metadata and
    carries no excerpt — an arbitrary 180 characters of a PDF is not an excerpt,
    it is a fragment, and it would read as though someone chose it.
    """
    question = _KB_QUESTION_LINE.search(chunk.text)
    answer = _KB_ANSWER_BLOCK.search(chunk.text)

    label = question.group(1).strip() if question else chunk.metadata.get("title", "").strip()
    snippet = truncate_on_word(answer.group(1)) if answer else ""
    return (label or None), (snippet or None)


def build_citations(chunks: list[RetrievedChunk], cited_ids: list[str]) -> list[Citation]:
    """Build the citations array from stored metadata only.

    The model's output text selects *which* rows are cited; it never supplies
    the citation content.
    """
    by_id = {chunk.id: chunk for chunk in chunks}
    citations: list[Citation] = []

    for kb_id in cited_ids:
        chunk = by_id.get(kb_id)
        if chunk is None:
            # Unreachable via verify_citations, which filters first. Kept as a
            # belt-and-braces guard so a future caller cannot bypass the check.
            logger.warning("hallucinated_citation id=%s reason=not_in_retrieved_set", kb_id)
            continue
        meta = chunk.metadata
        label, snippet = kb_label_and_snippet(chunk)
        citations.append(
            Citation(
                kb_id=kb_id,
                category=meta.get("category", ""),
                subcategory=meta.get("subcategory", ""),
                source_url=meta.get("source_url", ""),
                source_type=meta.get("source_type", ""),
                as_of=meta.get("as_of", ""),
                confidence=meta.get("confidence", ""),
                # Null, never a guess. A client is told to treat an unknown
                # volatility as the cautious case; inventing "low" here would
                # quietly downgrade a schedule that nobody has classified.
                volatility=meta.get("volatility") or None,
                label=label,
                snippet=snippet,
            )
        )
    return citations


def build_chat_model(settings: Settings | None = None) -> BaseChatModel:
    """Build the chat client from settings.

    Model id and temperature always come from settings — CLAUDE.md rule 2.
    """
    settings = settings or get_settings()
    # `omit` means send no reasoning_effort at all, for a model that does not
    # accept the parameter. See the setting's comment for why the default is
    # `none` — it is what lets a reasoning model use function tools.
    effort = settings.OPENAI_REASONING_EFFORT.strip().lower()
    return ChatOpenAI(
        model=settings.OPENAI_CHAT_MODEL,
        temperature=settings.CHAT_TEMPERATURE,
        max_tokens=settings.MAX_OUTPUT_TOKENS,
        api_key=settings.OPENAI_API_KEY or None,
        timeout=settings.OPENAI_TIMEOUT_SECONDS,
        # Retries are handled by app.upstream so the policy is ours, uniform
        # across chat and embeddings, and testable.
        max_retries=0,
        **({} if effort in {"", "omit"} else {"reasoning_effort": effort}),
    )


def build_messages(
    query: str,
    chunks: list[RetrievedChunk],
    today: date | None = None,
) -> list[SystemMessage | HumanMessage]:
    """Build the message list sent upstream. Shared by both response paths."""
    system_prompt = render_system_prompt(
        context=format_context(chunks),
        current_date=(today or date.today()).isoformat(),
    )
    return [SystemMessage(content=system_prompt), HumanMessage(content=query)]


def _refusal_result(category: str, elapsed_ms: int) -> AnswerResult:
    """The deterministic refusal, identical on both paths."""
    return AnswerResult(
        answer=REFUSAL_MESSAGE,
        grounded=False,
        refusal=True,
        refusal_category=category,
        best_score=0.0,
        model=None,
        latency_ms=elapsed_ms,
    )


def _greeting_result(message: str, elapsed_ms: int) -> AnswerResult:
    """The conversational reply, identical on both paths.

    `refusal` is **False**: nothing was refused and nothing failed. Filing every
    "hello" as a refusal would make the refusal rate meaningless.

    `grounded` is **True**, which reads oddly next to `citations: []` and is the
    correct answer to the question the field actually asks. Its definition is
    *"every id and figure traces to a retrieved row"* — and this message contains
    no id and no figure, so every one of them traces, vacuously.

    It was `False` first, on the reasoning that nothing had been retrieved. That
    is a different question, and answering it here had a visible consequence:
    `MessageBubble` renders `UngroundedNotice` — *"I could not fully verify this
    — please confirm with SCASPA"* — on any assistant turn that is not grounded.
    So "hi" was answered warmly and then undercut by an amber warning about a
    claim it had not made, on the interaction `docs/demo-day.md` opens with.

    Setting it True is safe in one direction only, and that is the direction
    that matters: `grounded` is **never used to add confidence** — there is no
    "verified" badge anywhere in this product, by design — so the only effect is
    that nothing is withdrawn from a message with nothing to withdraw.
    """
    return AnswerResult(
        answer=message,
        grounded=True,
        refusal=False,
        citations=[],
        retrieved=[],
        best_score=0.0,
        model=None,
        latency_ms=elapsed_ms,
    )


def _no_answer_result(
    chunks: list[RetrievedChunk], best_score: float, elapsed_ms: int
) -> AnswerResult:
    """The low-confidence short-circuit, identical on both paths."""
    return AnswerResult(
        answer=NO_ANSWER_MESSAGE,
        grounded=False,
        refusal=True,
        citations=[],
        retrieved=chunks,
        best_score=best_score,
        model=None,
        latency_ms=elapsed_ms,
    )


def finalise_answer(
    raw_answer: str,
    query: str,
    chunks: list[RetrievedChunk],
    best_score: float,
    elapsed_ms: int,
    settings: Settings,
) -> AnswerResult:
    """Verify a completed answer. The single verification path.

    Both `answer_question` and the streaming path funnel through this, so the
    two can never drift apart on what counts as grounded.
    """
    retrieved_ids = {chunk.id for chunk in chunks}
    clean_answer, verified_ids, hallucinated = verify_citations(raw_answer, retrieved_ids)

    for kb_id in hallucinated:
        logger.warning(
            "hallucinated_citation id=%s question=%r retrieved=%s",
            kb_id,
            query,
            sorted(retrieved_ids),
        )

    citations = build_citations(chunks, verified_ids)

    unverified_figures = find_unverified_figures(clean_answer, chunks)
    for value in unverified_figures:
        logger.warning(
            "unverified_figure value=%r question=%r retrieved=%s",
            value,
            query,
            sorted(retrieved_ids),
        )

    # --- the numeric grounding gate: last line of defence ---
    #
    # Every currency amount, time, date and phone number in the answer must appear
    # in a retrieved row. Previously an unverifiable figure only set
    # grounded=false and the answer still shipped — but a flag in a JSON field
    # does not stop anyone reading the number. Now the answer is discarded.
    numbers = check_numbers(clean_answer, chunks)
    ungrounded_numbers = numbers.values
    answer_replaced = False
    if ungrounded_numbers:
        logger.warning(
            "answer_replaced_ungrounded_numbers question=%r values=%s retrieved=%s",
            query,
            ungrounded_numbers,
            sorted(retrieved_ids),
        )
        clean_answer = UNGROUNDED_NUMBER_MESSAGE
        answer_replaced = True
        # The replacement carries no citations of its own: nothing in it is a
        # claim about SCASPA's facts.
        citations = []
        verified_ids = []

    grounded = (
        bool(verified_ids)
        and not hallucinated
        and not unverified_figures
        and not ungrounded_numbers
    )

    if not verified_ids and not answer_replaced:
        logger.warning("uncited_answer question=%r retrieved=%s", query, sorted(retrieved_ids))

    logger.info(
        "answered question=%r best_score=%.3f grounded=%s cited=%s latency_ms=%d",
        query,
        best_score,
        grounded,
        verified_ids,
        elapsed_ms,
    )

    return AnswerResult(
        answer=clean_answer,
        grounded=grounded,
        refusal=False,
        citations=citations,
        retrieved=chunks,
        cited_ids=verified_ids,
        hallucinated_citations=hallucinated,
        unverified_figures=unverified_figures,
        ungrounded_numbers=ungrounded_numbers,
        answer_replaced=answer_replaced,
        best_score=best_score,
        model=settings.OPENAI_CHAT_MODEL,
        latency_ms=elapsed_ms,
    )


def answer_question(
    query: str,
    *,
    k: int | None = None,
    category: str | None = None,
    today: date | None = None,
    chat_model: BaseChatModel | None = None,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
) -> AnswerResult:
    """Answer one question from the knowledge base.

    `chat_model` and `embeddings` are injectable so the chain can be exercised
    without network access.
    """
    settings = settings or get_settings()
    started = time.perf_counter()

    # --- Refusal gate: never reaches the model, so it cannot be talked round ---
    refusal_category = match_refusal_category(query)
    if refusal_category is not None:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info(
            "refused question=%r category=%s latency_ms=%d", query, refusal_category, elapsed
        )
        return _refusal_result(refusal_category, elapsed)

    # --- Not a question: answer it as one and skip retrieval entirely ---
    pleasantry = conversational_reply(query)
    if pleasantry is not None:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info("greeting question=%r latency_ms=%d", query, elapsed)
        return _greeting_result(pleasantry, elapsed)

    # --- Pre-flight probe: nothing can answer this, so skip the agent entirely ---
    best_score = best_available_score(query, settings, embeddings)
    if best_score < settings.RETRIEVAL_MIN_SCORE:
        elapsed = int((time.perf_counter() - started) * 1000)
        # Question text and latency are logged; no identifiers — rule 9.
        logger.info(
            "low_confidence_refusal question=%r best_score=%.3f threshold=%.3f latency_ms=%d",
            query,
            best_score,
            settings.RETRIEVAL_MIN_SCORE,
            elapsed,
        )
        return _no_answer_result([], best_score, elapsed)

    # --- The agent chooses its own tools from here ---
    turn = call_with_retry(
        lambda: run_agent(
            query,
            settings=settings,
            chat_model=chat_model,
            embeddings=embeddings,
            today=today,
            category=category,
        ),
        settings=settings,
    )

    elapsed = int((time.perf_counter() - started) * 1000)
    return _from_turn(turn, query, best_score, elapsed, settings)


def _from_turn(
    turn: AgentTurnResult,
    query: str,
    best_score: float,
    elapsed_ms: int,
    settings: Settings,
) -> AnswerResult:
    """Verify an agent turn's answer against everything its tools retrieved.

    The validation rule is unchanged from the fixed chain. What changed is the
    set it validates against: the **union of every id returned by every search
    tool** during the turn, so a row found on the first call can still be cited
    after the third.
    """
    chunks = list(turn.retrieved.values())
    tool_calls = [ToolCallInfo(name=t.name, summary=t.summary, ms=t.ms) for t in turn.tool_calls]

    if turn.hit_tool_limit:
        # The middleware's internal string must never reach a user.
        result = _no_answer_result(chunks, best_score, elapsed_ms)
        result.hit_tool_limit = True
        result.tool_calls = tool_calls
        result.prompt_tokens = turn.prompt_tokens
        result.completion_tokens = turn.completion_tokens
        return result

    result = finalise_answer(turn.answer, query, chunks, best_score, elapsed_ms, settings)
    result.tool_calls = tool_calls
    result.prompt_tokens = turn.prompt_tokens
    result.completion_tokens = turn.completion_tokens
    result.chart = turn.chart
    result.card = turn.card
    return result


# ---------------------------------------------------------------- streaming


async def astream_answer(
    query: str,
    *,
    k: int | None = None,
    category: str | None = None,
    today: date | None = None,
    chat_model: BaseChatModel | None = None,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
    is_disconnected: Callable[[], Awaitable[bool]] | None = None,
) -> AsyncIterator[tuple[str, dict]]:
    """Stream an answer as `(event_name, payload)` pairs.

    Content is identical to `answer_question` — both share `finalise_answer`, so
    grounding and citations cannot drift between the two endpoints.

    Two things follow from citation validation needing the *finished* text:

    * Tokens stream **raw**, markers and all. A chunk boundary can fall inside
      `[kb-014]`, so stripping mid-stream would corrupt the marker. The client
      renders markers inline and reconciles them when `citations` arrives.
    * `citations` and `done` are emitted only after generation completes.

    Cancellation is the disconnect mechanism. When the caller closes this
    generator (see `contextlib.aclosing` in the router), `GeneratorExit`
    propagates into the `async for` below and the upstream stream is closed, so a
    user shutting a tab stops costing tokens.

    `is_disconnected` is an optional extra poll for non-HTTP callers. The HTTP
    router does **not** pass it: `StreamingResponse` already consumes the ASGI
    receive channel to watch for disconnects, and a second consumer competes for
    those messages.
    """
    settings = settings or get_settings()
    started = time.perf_counter()

    async def disconnected() -> bool:
        return bool(is_disconnected and await is_disconnected())

    # --- Deterministic refusal: no generation, but still streamed for shape ---
    refusal_category = match_refusal_category(query)
    if refusal_category is not None:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info(
            "refused question=%r category=%s latency_ms=%d", query, refusal_category, elapsed
        )
        result = _refusal_result(refusal_category, elapsed)
        yield "token", {"text": result.answer}
        yield "citations", {"citations": []}
        yield "done", _done_payload(result, settings)
        return

    # --- Not a question. Same gate as `answer_question`, same order. ---
    #
    # This must exist on BOTH paths or the browser never sees it: the UI streams,
    # so a greeting fixed only in `answer_question` would still arrive as
    # NO_ANSWER_MESSAGE for every user while passing a test written against the
    # synchronous endpoint.
    pleasantry = conversational_reply(query)
    if pleasantry is not None:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info("greeting question=%r latency_ms=%d", query, elapsed)
        result = _greeting_result(pleasantry, elapsed)
        yield "token", {"text": result.answer}
        yield "citations", {"citations": []}
        yield "done", _done_payload(result, settings)
        return

    best_score = best_available_score(query, settings, embeddings)
    if best_score < settings.RETRIEVAL_MIN_SCORE:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info(
            "low_confidence_refusal question=%r best_score=%.3f threshold=%.3f latency_ms=%d",
            query,
            best_score,
            settings.RETRIEVAL_MIN_SCORE,
            elapsed,
        )
        result = _no_answer_result([], best_score, elapsed)
        yield "token", {"text": result.answer}
        yield "citations", {"citations": []}
        yield "done", _done_payload(result, settings)
        return

    turn: AgentTurnResult | None = None
    async for event, data in arun_agent(
        query,
        settings=settings,
        chat_model=chat_model,
        embeddings=embeddings,
        today=today,
        category=category,
    ):
        if await disconnected():
            logger.info("client_disconnected question=%r", query)
            return
        if event == "_result":
            turn = data["result"]
            continue
        # tool_start, tool_end and token pass straight through to the client.
        yield event, data

    elapsed = int((time.perf_counter() - started) * 1000)
    if turn is None:  # pragma: no cover — arun_agent always finishes with _result
        turn = AgentTurnResult(answer="")
    result = _from_turn(turn, query, best_score, elapsed, settings)

    if result.hit_tool_limit:
        # Tokens streamed so far were the middleware's internal message. Tell the
        # client to discard them and show the no-answer message instead.
        yield "replace", {"text": result.answer}

    yield "citations", {"citations": [c.model_dump() for c in result.citations]}
    # A chart, if make_chart validated one. Always before `done` so a client can
    # render it in the same frame as the finished answer.
    if result.chart is not None:
        yield "chart", result.chart.model_dump()
    # The card request, not the card. The router populates the rows from the feed
    # and re-emits — the streaming layer has no business reading an ops source.
    if result.card is not None:
        yield "_card_request", {"request": result.card.model_dump()}
    yield "done", _done_payload(result, settings)


def _done_payload(result: AnswerResult, settings: Settings) -> dict:
    """The `done` frame. Deliberately excludes the model name — see errors.py.

    `refusal_category` is here so a *streamed* refusal can pick the same specific
    copy the non-streaming endpoint allows. Without it a boundary refusal ("I
    cannot look up your container") and a plain no-answer arrive
    indistinguishable, and the client has to frame both as the latter.

    `answer_replaced` and `step_limit_reached` are here for the same reason and
    were the same omission. Both are computed on every turn and both were
    dropped at the wire boundary, so a client could see that *an* answer came
    back but not that it had been rewritten, nor that it stopped early. The
    stream carries exactly what `POST /api/chat` carries, so a surface does not
    lose a distinction by choosing to stream.
    """
    from app.rag.ingest import read_index_meta

    meta = read_index_meta(settings)
    return {
        "latency_ms": result.latency_ms,
        "grounded": result.grounded,
        "refusal": result.refusal,
        "refusal_category": result.refusal_category,
        "answer_replaced": result.answer_replaced,
        "step_limit_reached": result.hit_tool_limit,
        "kb_version": meta.kb_version if meta else None,
    }


__all__ = [
    "ESCALATION_BLOCK",
    "AnswerResult",
    "Citation",
    "answer_question",
    "build_citations",
    "extract_citations",
    "find_unverified_figures",
    "format_context",
    "verify_citations",
]
