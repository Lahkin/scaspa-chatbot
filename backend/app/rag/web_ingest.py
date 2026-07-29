"""Ingest scraped pages and PDFs into the `scaspa_web` collection.

Kept apart from `app.rag.ingest`, which owns the curated knowledge base. The two
have different trust levels and different rebuild rhythms: the knowledge base is
human-verified and changes when the researchers export, while the site changes
whenever SCASPA publishes.

Nothing flagged for the client ever arrives here. The scraper quarantines
zero-value statistics and obfuscated emails before writing its JSONL, so a
scraped `0` cannot reach the index by this route.
"""

import logging
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from app.config import Settings, get_settings
from app.rag.chunking import chunk_web_document
from app.rag.store import WEB_COLLECTION, count, get_store, reset
from app.scraper.pdfs import PdfDocument, chunk_pdf
from app.scraper.site import EMAIL_PLACEHOLDER, load_pages

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 64


def chunk_scraped_pages(path: Path) -> list[Document]:
    """Chunk a scraped JSONL file."""
    documents: list[Document] = []
    for record in load_pages(path):
        text = record.get("text", "")
        if not text.strip():
            continue
        fetched = record.get("fetched_at", "")
        try:
            fetched_on = datetime.fromisoformat(fetched).date()
        except ValueError:
            fetched_on = datetime.now(UTC).date()

        for chunk in chunk_web_document(
            text,
            url=record.get("url", ""),
            title=record.get("title", ""),
            fetched_at=fetched_on,
        ):
            chunk.metadata["source_type"] = "official-site"
            chunk.metadata["content_hash"] = record.get("content_hash", "")
            documents.append(chunk)
    return documents


def assert_no_quarantined_content(documents: list[Document]) -> None:
    """Last line of defence before anything reaches the web index.

    The scraper already quarantines these, so this should never fire. It exists
    because a scraped `0` reaching the index — an assistant reporting that
    SCASPA handled zero cruise passengers — is the single worst outcome in this
    whole pipeline, and one guard is not enough for that.
    """
    for document in documents:
        if EMAIL_PLACEHOLDER in document.page_content:
            continue  # the token itself is fine; it is the *address* we exclude
        if "[email protected]" in document.page_content.lower():
            raise ValueError(
                f"Cloudflare email placeholder reached ingestion from "
                f"{document.metadata.get('source_url')}. It must be replaced by the "
                f"scraper, never indexed."
            )


def ingest_web(
    documents: list[Document],
    settings: Settings | None = None,
    embeddings: Embeddings | None = None,
    echo=print,  # noqa: ANN001
) -> int:
    """Rebuild `scaspa_web` from the given documents. Returns the count indexed.

    A full reset rather than an upsert: SCASPA takes pages down, and an upsert
    would leave the assistant citing a travel advisory that was withdrawn.
    """
    settings = settings or get_settings()
    assert_no_quarantined_content(documents)

    reset(WEB_COLLECTION, embeddings=embeddings, settings=settings)
    store = get_store(WEB_COLLECTION, embeddings=embeddings, settings=settings)

    if not documents:
        echo("  nothing to index")
        return 0

    echo(f"  Embedding {len(documents)} web chunks with {settings.OPENAI_EMBEDDING_MODEL}…")
    done = 0
    for start in range(0, len(documents), EMBED_BATCH_SIZE):
        batch = documents[start : start + EMBED_BATCH_SIZE]
        store.add_documents(batch)
        done += len(batch)
        echo(f"    [{done * 100 // len(documents):>3}%] {done}/{len(documents)} chunks")

    total = count(store)
    logger.info("web_index_built chunks=%d", total)
    return total


def build_web_documents(
    jsonl_path: Path | None = None,
    pdfs: list[PdfDocument] | None = None,
    settings: Settings | None = None,
) -> list[Document]:
    """Assemble every document destined for `scaspa_web`."""
    settings = settings or get_settings()
    documents: list[Document] = []

    if jsonl_path is None:
        candidates = sorted(settings.scraped_path.glob("scaspa_*.jsonl"))
        jsonl_path = candidates[-1] if candidates else None

    if jsonl_path and jsonl_path.exists():
        documents.extend(chunk_scraped_pages(jsonl_path))

    for pdf in pdfs or []:
        documents.extend(chunk_pdf(pdf))

    return documents
