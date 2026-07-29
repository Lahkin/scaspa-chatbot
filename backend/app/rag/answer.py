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
from datetime import date

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.agent.prompts import (
    CONTEXT_CHUNK_TEMPLATE,
    ESCALATION_BLOCK,
    NO_ANSWER_MESSAGE,
    REFUSAL_MESSAGE,
    render_system_prompt,
)
from app.config import Settings, get_settings
from app.rag.retriever import RetrievedChunk, retrieve

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
        citations.append(
            Citation(
                kb_id=kb_id,
                category=meta.get("category", ""),
                subcategory=meta.get("subcategory", ""),
                source_url=meta.get("source_url", ""),
                source_type=meta.get("source_type", ""),
                as_of=meta.get("as_of", ""),
                confidence=meta.get("confidence", ""),
            )
        )
    return citations


def build_chat_model(settings: Settings | None = None) -> BaseChatModel:
    """Build the chat client from settings.

    Model id and temperature always come from settings — CLAUDE.md rule 2.
    """
    settings = settings or get_settings()
    return ChatOpenAI(
        model=settings.OPENAI_CHAT_MODEL,
        temperature=settings.CHAT_TEMPERATURE,
        max_tokens=settings.MAX_OUTPUT_TOKENS,
        api_key=settings.OPENAI_API_KEY or None,
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
        return AnswerResult(
            answer=REFUSAL_MESSAGE,
            grounded=False,
            refusal=True,
            refusal_category=refusal_category,
            best_score=0.0,
            model=None,
            latency_ms=elapsed,
        )

    chunks = retrieve(
        query,
        k=k,
        category=category,
        embeddings=embeddings,
        settings=settings,
    )
    best_score = chunks[0].score if chunks else 0.0

    # --- Short-circuit: too weak to answer from, so do not generate at all ---
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
        return AnswerResult(
            answer=NO_ANSWER_MESSAGE,
            grounded=False,
            refusal=True,
            citations=[],
            retrieved=chunks,
            best_score=best_score,
            model=None,
            latency_ms=elapsed,
        )

    context = format_context(chunks)
    system_prompt = render_system_prompt(
        context=context,
        current_date=(today or date.today()).isoformat(),
    )

    model = chat_model or build_chat_model(settings)
    response = model.invoke([SystemMessage(content=system_prompt), HumanMessage(content=query)])
    raw_answer = response.content if isinstance(response.content, str) else str(response.content)

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

    # A correct citation proves the row exists, not that the figure came from
    # it. Rule 10 closes that gap.
    unverified_figures = find_unverified_figures(clean_answer, chunks)
    for value in unverified_figures:
        logger.warning(
            "unverified_figure value=%r question=%r retrieved=%s",
            value,
            query,
            sorted(retrieved_ids),
        )

    # Conservative: an answer with no verifiable citation is not grounded, even
    # if nothing was obviously fabricated. Silence is not evidence.
    grounded = bool(verified_ids) and not hallucinated and not unverified_figures

    if not verified_ids:
        logger.warning("uncited_answer question=%r retrieved=%s", query, sorted(retrieved_ids))

    elapsed = int((time.perf_counter() - started) * 1000)
    logger.info(
        "answered question=%r best_score=%.3f grounded=%s cited=%s latency_ms=%d",
        query,
        best_score,
        grounded,
        verified_ids,
        elapsed,
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
        best_score=best_score,
        model=settings.OPENAI_CHAT_MODEL,
        latency_ms=elapsed,
    )


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
