"""Retrieval over the knowledge base.

Deliberately plain: a single similarity search with optional metadata filtering.
No hybrid search, no reranking, no query rewriting. Those are worth adding only
against a measurement showing plain retrieval falling short, one at a time, so
each change can be attributed.

Scores come from `app.rag.store.search`, which guarantees a single 0–1
similarity where higher is more relevant. See `docs/decisions.md` 0003.
"""

import logging
import re
from dataclasses import dataclass, field

from langchain_core.embeddings import Embeddings
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.rag.hybrid import fuse
from app.rag.rewrite import classify_category, rewrite_query
from app.rag.store import KB_COLLECTION, get_store, search

logger = logging.getLogger(__name__)


@dataclass
class RetrievalTrace:
    """What each stage did. Logged, and surfaced by the eval harness.

    Without this, a retrieval change is unattributable: you can see the score
    moved but not which stage moved it.
    """

    original_query: str
    effective_query: str
    rewritten: bool = False
    classified_category: str | None = None
    category: str | None = None
    hybrid: bool = False
    reranked: bool = False
    returned: list[str] = field(default_factory=list)


class RetrievedChunk(BaseModel):
    """One chunk returned by retrieval.

    `id` is the knowledge-base row id and the only thing a citation may point
    at. `metadata` carries the full row metadata, so citations are built from
    stored data rather than from anything a model wrote.
    """

    id: str
    text: str
    score: float = Field(ge=0.0, le=1.0, description="Similarity; higher is more relevant")
    metadata: dict[str, str]

    @property
    def source_url(self) -> str:
        return self.metadata.get("source_url", "")

    @property
    def as_of(self) -> str:
        return self.metadata.get("as_of", "")

    @property
    def category(self) -> str:
        return self.metadata.get("category", "")


def _build_where(category: str | None, source_kind: str | None) -> dict | None:
    """Build a Chroma metadata filter.

    Chroma needs an explicit `$and` for more than one condition; a bare
    two-key dict is not a valid filter.
    """
    clauses = []
    if category:
        clauses.append({"category": category})
    if source_kind:
        clauses.append({"source_kind": source_kind})

    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def retrieve(
    query: str,
    k: int | None = None,
    category: str | None = None,
    source_kind: str | None = None,
    *,
    min_score: float = 0.0,
    history: list[str] | None = None,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
) -> list[RetrievedChunk]:
    """Retrieve the most relevant knowledge-base chunks for `query`.

    `k` defaults to `RETRIEVAL_TOP_K`. `min_score` defaults to 0.0 so callers see
    everything and can apply their own floor — `app.rag.answer` applies
    `RETRIEVAL_MIN_SCORE` itself, and the diagnostic CLI deliberately shows weak
    matches so a human can judge them.

    Four techniques apply in order, each behind its own setting so
    `scripts/evaluate.py` can compare configurations and any one can be switched
    off if it misbehaves:

    1. `RETRIEVAL_QUERY_REWRITE` — make an elliptical follow-up standalone.
    2. `RETRIEVAL_CATEGORY_FILTER` — restrict to one category when unambiguous.
    3. `RETRIEVAL_HYBRID` — fuse semantic ranking with BM25 for exact tokens.
    4. `RETRIEVAL_RERANK` — over-fetch, then score relevance with a cheap model.

    An explicit `category` argument always wins over the classifier: a caller
    that knows the category is more reliable than a keyword rule.

    Returns chunks sorted best-first; an empty list is a normal result.
    """
    settings = settings or get_settings()
    k = k or settings.RETRIEVAL_TOP_K
    trace = RetrievalTrace(original_query=query, effective_query=query)

    # --- 1. query rewriting ---
    if settings.RETRIEVAL_QUERY_REWRITE and history:
        rewritten = rewrite_query(query, history)
        if rewritten != query:
            trace.rewritten = True
            trace.effective_query = rewritten
    search_query = trace.effective_query

    # --- 2. metadata filtering ---
    effective_category = category
    if effective_category is None and settings.RETRIEVAL_CATEGORY_FILTER:
        effective_category = classify_category(search_query)
        trace.classified_category = effective_category
    trace.category = effective_category

    store = get_store(KB_COLLECTION, embeddings=embeddings, settings=settings)
    where = _build_where(effective_category, source_kind)

    # Over-fetch when a later stage will narrow the list down again.
    fetch_k = k
    if settings.RETRIEVAL_HYBRID or settings.RETRIEVAL_RERANK:
        fetch_k = max(k, settings.RETRIEVAL_FETCH_K)

    hits = search(store, search_query, k=fetch_k, min_score=0.0, where=where)
    chunks = [
        RetrievedChunk(
            id=doc.id or doc.metadata.get("id", ""),
            text=doc.page_content,
            score=doc.score,
            metadata=doc.metadata,
        )
        for doc in hits
    ]

    # --- 3. hybrid search ---
    if settings.RETRIEVAL_HYBRID:
        chunks = _hybrid(search_query, chunks, store, k, settings)
        trace.hybrid = True

    # --- 4. reranking ---
    if settings.RETRIEVAL_RERANK and len(chunks) > k:
        chunks = rerank(search_query, chunks, k, settings=settings)
        trace.reranked = True

    chunks = [c for c in chunks if c.score >= min_score][:k]
    trace.returned = [c.id for c in chunks]

    # Question text and latency may be logged; identifiers may not — rule 9.
    logger.debug("retrieval_trace %s", trace)
    return chunks


def _hybrid(
    query: str,
    semantic: list[RetrievedChunk],
    store,  # noqa: ANN001
    k: int,
    settings: Settings,
) -> list[RetrievedChunk]:
    """Fuse the semantic ranking with BM25 over the whole collection."""
    try:
        raw = store.get(include=["documents", "metadatas"])
    except Exception:  # noqa: BLE001 — hybrid must never break plain retrieval
        logger.warning("hybrid_corpus_unavailable — falling back to semantic only", exc_info=True)
        return semantic

    corpus = [
        (doc_id, text or "", meta or {})
        for doc_id, text, meta in zip(
            raw.get("ids", []), raw.get("documents", []), raw.get("metadatas", []), strict=False
        )
    ]
    fused = fuse(
        query,
        [(c.id, c.text, c.score, c.metadata) for c in semantic],
        corpus,
        k=k,
        semantic_weight=settings.RETRIEVAL_HYBRID_SEMANTIC_WEIGHT,
    )
    if not fused:
        return semantic
    return [RetrievedChunk(id=h.id, text=h.text, score=h.score, metadata=h.metadata) for h in fused]


def rerank(
    query: str,
    chunks: list[RetrievedChunk],
    k: int,
    settings: Settings | None = None,
    chat_model=None,  # noqa: ANN001
) -> list[RetrievedChunk]:
    """Keep the best `k` of an over-fetched candidate list, scored by a model.

    The only stage that costs a model call, which is why it is off by default and
    why the eval reports its latency alongside its accuracy. Buying two points of
    hit@1 for a second of latency is a trade to make on numbers, not on instinct.

    On any failure the original semantic ordering is returned unchanged. A
    reranker that breaks must degrade to plain retrieval, never to no results.
    """
    settings = settings or get_settings()
    if len(chunks) <= k:
        return chunks

    numbered = "\n\n".join(
        f"[{i}] {c.text[:400]}" for i, c in enumerate(chunks[: settings.RETRIEVAL_FETCH_K])
    )
    prompt = (
        "Rank these knowledge-base rows by how directly each answers the question. "
        f"Reply with only the indices, best first, comma separated.\n\n"
        f"Question: {query}\n\nRows:\n{numbered}"
    )

    try:
        if chat_model is None:
            from app.rag.answer import build_chat_model

            chat_model = build_chat_model(settings)
        response = chat_model.invoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)
        order = [int(m) for m in re.findall(r"\d+", str(text))]
    except Exception:  # noqa: BLE001 — degrade to semantic order, never to nothing
        logger.warning("rerank_failed — keeping semantic order", exc_info=True)
        return chunks[:k]

    seen: set[int] = set()
    ranked: list[RetrievedChunk] = []
    for index in order:
        if 0 <= index < len(chunks) and index not in seen:
            seen.add(index)
            ranked.append(chunks[index])
    # Anything the model did not mention keeps its semantic position at the back.
    ranked += [c for i, c in enumerate(chunks) if i not in seen]

    logger.info("reranked query=%r candidates=%d kept=%d", query, len(chunks), k)
    return ranked[:k]
