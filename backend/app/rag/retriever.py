"""Retrieval over the knowledge base.

Deliberately plain: a single similarity search with optional metadata filtering.
No hybrid search, no reranking, no query rewriting. Those are worth adding only
against a measurement showing plain retrieval falling short, one at a time, so
each change can be attributed.

Scores come from `app.rag.store.search`, which guarantees a single 0–1
similarity where higher is more relevant. See `docs/decisions.md` 0003.
"""

import logging

from langchain_core.embeddings import Embeddings
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.rag.store import KB_COLLECTION, get_store, search

logger = logging.getLogger(__name__)


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
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
) -> list[RetrievedChunk]:
    """Retrieve the most relevant knowledge-base chunks for `query`.

    `k` defaults to `RETRIEVAL_TOP_K`. `min_score` defaults to 0.0 so callers see
    everything and can apply their own floor — `app.rag.answer` applies
    `RETRIEVAL_MIN_SCORE` itself, and the diagnostic CLI deliberately shows weak
    matches so a human can judge them.

    Returns chunks sorted best-first; an empty list is a normal result.
    """
    settings = settings or get_settings()
    k = k or settings.RETRIEVAL_TOP_K

    store = get_store(KB_COLLECTION, embeddings=embeddings, settings=settings)
    where = _build_where(category, source_kind)

    hits = search(store, query, k=k, min_score=min_score, where=where)

    chunks = [
        RetrievedChunk(
            id=doc.id or doc.metadata.get("id", ""),
            text=doc.page_content,
            score=doc.score,
            metadata=doc.metadata,
        )
        for doc in hits
    ]

    # Question text and latency may be logged; identifiers may not — rule 9.
    logger.debug(
        "retrieved %d chunks for query %r (k=%d, category=%s, source_kind=%s)",
        len(chunks),
        query,
        k,
        category,
        source_kind,
    )
    return chunks
