"""Hybrid retrieval: semantic similarity fused with BM25 keyword matching.

Semantic search is weak on exact tokens, and exact tokens are precisely what
matters here — `XCD 333.33`, `04:04`, `869-465-8121`, `kb-014`, container sizes.
An embedding puts "the container handling charge" near "the container tariff"
whether the number is 333.33 or 999.99, because the number carries almost no
semantic weight. BM25 does the opposite: it matches the literal token.

Fusion is done by **LangChain's `EnsembleRetriever`** (reciprocal-rank fusion).
The BM25 side is a small retriever over `rank_bm25` rather than
`langchain_community.retrievers.BM25Retriever`, which would drag in the whole
`langchain-community` package for one class.

## The honest caveat about scores

`EnsembleRetriever` fuses **ranks**, not scores, so a fused result has no cosine
similarity. `RETRIEVAL_MIN_SCORE` is an absolute cosine threshold, and the two do
not mix. So when hybrid is on, the reported `score` is a *fused* score in 0–1 and
the threshold means something different — it needs its own tuning. That is why
hybrid ships **off by default**: enabling it silently changes what the refusal
gate is measuring.
"""

import logging
import re
from dataclasses import dataclass

from langchain_classic.retrievers import EnsembleRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

logger = logging.getLogger(__name__)

_TOKEN = re.compile(r"[a-z0-9][a-z0-9.,:$-]*")


def tokenise(text: str) -> list[str]:
    """Tokens for BM25, keeping numbers and punctuation that carry meaning.

    `44.44` and `869-465-8121` must survive as single tokens; splitting on
    punctuation would destroy exactly the content BM25 is here to match.
    """
    return _TOKEN.findall(text.lower())


class SimpleBM25Retriever(BaseRetriever):
    """BM25 over an in-memory corpus, via `rank_bm25`."""

    documents: list[Document]
    k: int = 5
    _bm25: object = None

    def model_post_init(self, __context: object) -> None:  # noqa: PYI063
        from rank_bm25 import BM25Okapi

        corpus = [tokenise(d.page_content) for d in self.documents] or [[""]]
        object.__setattr__(self, "_bm25", BM25Okapi(corpus))

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun | None = None
    ) -> list[Document]:
        if not self.documents:
            return []
        scores = self._bm25.get_scores(tokenise(query))
        ranked = sorted(zip(self.documents, scores, strict=True), key=lambda p: p[1], reverse=True)
        return [doc for doc, score in ranked[: self.k] if score > 0]


class StaticRetriever(BaseRetriever):
    """Wraps an already-computed ranked list so the ensemble can fuse it.

    The semantic leg is run through `app.rag.store.search` first, so its scores
    are kept and its cosine ordering preserved; this just presents that ordering
    to `EnsembleRetriever`.
    """

    documents: list[Document]

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun | None = None
    ) -> list[Document]:
        return list(self.documents)


@dataclass
class FusedHit:
    """One fused result. `score` is a rank-fusion score, not a cosine similarity."""

    id: str
    text: str
    score: float
    metadata: dict


def fuse(
    query: str,
    semantic: list[tuple[str, str, float, dict]],
    corpus: list[tuple[str, str, dict]],
    k: int,
    semantic_weight: float = 0.5,
) -> list[FusedHit]:
    """Fuse a semantic ranking with BM25 over the same corpus.

    `semantic` is `(id, text, score, metadata)` best-first. `corpus` is every
    document available to BM25 as `(id, text, metadata)`.

    Returns at most `k` hits ordered best-first, with a fused score normalised to
    0–1 so the field keeps its documented range even though its meaning changes.
    """
    if not corpus:
        return []

    semantic_docs = [
        Document(page_content=text, metadata={**meta, "_id": doc_id})
        for doc_id, text, _score, meta in semantic
    ]
    corpus_docs = [
        Document(page_content=text, metadata={**meta, "_id": doc_id})
        for doc_id, text, meta in corpus
    ]

    ensemble = EnsembleRetriever(
        retrievers=[
            StaticRetriever(documents=semantic_docs),
            SimpleBM25Retriever(documents=corpus_docs, k=max(k, 10)),
        ],
        weights=[semantic_weight, 1.0 - semantic_weight],
    )

    fused_docs = ensemble.invoke(query)
    if not fused_docs:
        return []

    # EnsembleRetriever returns rank-fused order without exposing the score, so
    # derive one from position. Normalised to 0-1 to keep the field's range.
    total = len(fused_docs)
    by_id = {doc_id: (text, meta) for doc_id, text, meta in corpus}
    hits: list[FusedHit] = []
    for position, doc in enumerate(fused_docs[:k]):
        doc_id = doc.metadata.get("_id", "")
        text, meta = by_id.get(doc_id, (doc.page_content, doc.metadata))
        hits.append(
            FusedHit(
                id=doc_id,
                text=text,
                score=round(1.0 - (position / max(total, 1)), 4),
                metadata={key: value for key, value in meta.items() if key != "_id"},
            )
        )

    logger.info(
        "hybrid_fused query=%r semantic=%d corpus=%d returned=%d",
        query,
        len(semantic),
        len(corpus),
        len(hits),
    )
    return hits
