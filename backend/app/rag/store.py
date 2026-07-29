"""Chroma vector store access, with a single sane scoring convention.

## The scoring trap

Chroma's `similarity_search_with_score` returns a **distance**: lower means more
similar. Treating that number as a similarity — sorting descending, or comparing
it against a `RETRIEVAL_MIN_SCORE` floor — silently returns the *worst* matches,
with no error to notice. Measured on this stack: for the query "ferry", the
correct document scored `0.0` and an unrelated one scored `1.0`.

Chroma's default distance metric is also Euclidean, not cosine, and LangChain's
`similarity_search_with_relevance_scores` on an `l2` collection returned `-0.414`
for an orthogonal document — outside the 0–1 range, with a `UserWarning`.

So this module does two things and the rest of the codebase relies on both:

1. Every collection is created with **cosine** space.
2. `search` returns a single `score` field where **higher is more relevant**,
   clamped to 0–1, sorted best-first.

Nothing outside this module should call a raw Chroma search method. See
`docs/decisions.md` entry 0003.
"""

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings

from app.config import Settings, get_settings

KB_COLLECTION = "scaspa_kb"
WEB_COLLECTION = "scaspa_web"
COLLECTIONS = (KB_COLLECTION, WEB_COLLECTION)

# Cosine, not Chroma's Euclidean default. See the module docstring.
COLLECTION_CONFIGURATION: dict[str, dict[str, str]] = {"hnsw": {"space": "cosine"}}


class ScoredDocument(Document):
    """A retrieved document carrying the one score the codebase agrees on.

    `score` is a similarity in 0–1 where higher is more relevant — never a
    distance.
    """

    score: float


def normalise_score(distance: float) -> float:
    """Convert a Chroma **cosine distance** into a 0–1 similarity.

    Cosine distance runs 0 (identical direction) to 2 (opposite), so similarity
    is `1 - distance`, clamped into 0–1. The clamp only bites for vectors more
    than 90° apart, which for text embeddings means "unrelated" — reporting 0.0
    there is correct and keeps the contract exact.
    """
    return max(0.0, min(1.0, 1.0 - distance))


def build_embeddings(settings: Settings | None = None) -> Embeddings:
    """Build the embedding client from settings.

    The model id always comes from settings, never a literal — CLAUDE.md rule 2.
    """
    settings = settings or get_settings()
    return OpenAIEmbeddings(
        model=settings.OPENAI_EMBEDDING_MODEL,
        api_key=settings.OPENAI_API_KEY or None,
    )


def get_store(
    collection: str,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
) -> Chroma:
    """Open (or create) a persisted collection.

    `embeddings` is injectable so tests can run without an OpenAI API key.
    """
    settings = settings or get_settings()
    if collection not in COLLECTIONS:
        raise ValueError(f"unknown collection {collection!r}; expected one of {COLLECTIONS}")

    persist_dir = settings.chroma_path
    persist_dir.mkdir(parents=True, exist_ok=True)

    return Chroma(
        collection_name=collection,
        embedding_function=embeddings or build_embeddings(settings),
        persist_directory=str(persist_dir),
        collection_configuration=COLLECTION_CONFIGURATION,
    )


def reset(
    collection: str,
    embeddings: Embeddings | None = None,
    settings: Settings | None = None,
) -> None:
    """Drop a collection and recreate it empty.

    Used only by `scripts/build_index.py` on a forced rebuild. This destroys the
    indexed data for that collection.
    """
    store = get_store(collection, embeddings=embeddings, settings=settings)
    store.delete_collection()
    # Reopen so the collection exists and is ready to be written to.
    get_store(collection, embeddings=embeddings, settings=settings)


def search(
    store: Chroma,
    query: str,
    k: int,
    min_score: float = 0.0,
    where: dict | None = None,
) -> list[ScoredDocument]:
    """Search, returning documents scored 0–1 with higher meaning more relevant.

    This is the only search entry point the rest of the codebase should use.
    Results are sorted best-first and filtered to `score >= min_score`.

    `where` is a Chroma metadata filter, applied before scoring.
    """
    hits = store.similarity_search_with_score(query, k=k, filter=where)

    scored = [
        ScoredDocument(
            id=doc.id,
            page_content=doc.page_content,
            metadata=doc.metadata,
            score=normalise_score(distance),
        )
        for doc, distance in hits
    ]
    scored = [doc for doc in scored if doc.score >= min_score]
    scored.sort(key=lambda d: d.score, reverse=True)
    return scored


def count(store: Chroma) -> int:
    """Number of documents currently in a collection."""
    return store._collection.count()  # noqa: SLF001 — Chroma exposes no public count
