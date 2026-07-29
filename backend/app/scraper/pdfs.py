"""Download and extract SCASPA's published PDFs.

The richest content on the site is in PDFs — the Port Act, the seaport tariffs
and eight audited financial statements — and an HTML-only scraper walks straight
past all of it.

**Extraction uses pdfplumber**, chosen by measuring three libraries against a
real SCASPA financial statement rather than by reputation. PyMuPDF put every
table cell on its own line, which for a tariff table means a fee can end up
attributed to the wrong service. See `docs/decisions.md` 0011 and the evidence
in `data/scraped/pdf_bakeoff/comparison.md`.

Chunking goes through `chunk_web_document` (800 / 120) so web and PDF content
chunk identically, with `source_type="official-pdf"` and a page number, because
"page 34 of the Port Act" is a citation a person can actually check.
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
from langchain_core.documents import Document

from app.config import Settings, get_settings
from app.rag.chunking import chunk_web_document
from app.scraper.site import assert_not_blocked, is_in_scope

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT_SECONDS = 120.0
MAX_PDF_BYTES = 60 * 1024 * 1024


@dataclass
class PdfDocument:
    """One downloaded PDF and its extracted pages."""

    url: str
    path: Path
    content_hash: str
    fetched_at: str
    pages: list[str] = field(default_factory=list)
    title: str = ""

    @property
    def page_count(self) -> int:
        return len(self.pages)


def pdf_dir(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = settings.scraped_path / "pdfs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def download_pdf(
    url: str,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> PdfDocument | None:
    """Download one PDF, skipping the fetch if the content hash already matches.

    Returns None if the URL is out of scope or the download fails. Raises
    `BlockedURLError` for a blocklisted URL — never a silent skip.
    """
    settings = settings or get_settings()
    assert_not_blocked(url, settings)
    if not is_in_scope(url):
        logger.warning("pdf_out_of_scope url=%s", url)
        return None

    destination = pdf_dir(settings) / Path(url.split("?")[0]).name
    owns_client = client is None
    client = client or httpx.Client(
        headers={"User-Agent": settings.SCRAPER_USER_AGENT},
        timeout=DOWNLOAD_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    try:
        if destination.exists():
            data = destination.read_bytes()
            logger.info("pdf_cached url=%s bytes=%d", url, len(data))
        else:
            response = client.get(url)
            response.raise_for_status()
            data = response.content
            if len(data) > MAX_PDF_BYTES:
                logger.warning("pdf_too_large url=%s bytes=%d", url, len(data))
                return None
            destination.write_bytes(data)
            logger.info("pdf_downloaded url=%s bytes=%d", url, len(data))
    except httpx.HTTPError as exc:
        logger.warning("pdf_failed url=%s error=%s", url, exc)
        return None
    finally:
        if owns_client:
            client.close()

    return PdfDocument(
        url=url,
        path=destination,
        content_hash=hashlib.sha256(data).hexdigest(),
        fetched_at=datetime.now(UTC).isoformat(),
        title=destination.stem.replace("_", " ").replace("-", " ").strip(),
    )


def extract_pages(path: Path) -> list[str]:
    """Extract text page by page with pdfplumber.

    Page-by-page rather than whole-document so a chunk can carry the page number
    it came from.
    """
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def chunk_pdf(document: PdfDocument, fetched_on: date | None = None) -> list[Document]:
    """Chunk one PDF into documents ready for the vector store.

    Each chunk carries its page number, so a citation can say which page of the
    Port Act a claim came from.
    """
    fetched_on = fetched_on or datetime.now(UTC).date()
    chunks: list[Document] = []

    for index, text in enumerate(document.pages, start=1):
        if not text.strip():
            continue
        for chunk in chunk_web_document(
            text,
            url=document.url,
            title=document.title,
            fetched_at=fetched_on,
        ):
            chunk.metadata.update(
                {
                    "source_type": "official-pdf",
                    "page": str(index),
                    "content_hash": document.content_hash,
                }
            )
            chunks.append(chunk)
    return chunks


def collect_pdfs(
    urls: list[str],
    settings: Settings | None = None,
    limit: int | None = None,
    echo=print,  # noqa: ANN001
) -> list[PdfDocument]:
    """Download and extract a list of PDF URLs."""
    settings = settings or get_settings()
    documents: list[PdfDocument] = []
    selected = urls[:limit] if limit else urls

    with httpx.Client(
        headers={"User-Agent": settings.SCRAPER_USER_AGENT},
        timeout=DOWNLOAD_TIMEOUT_SECONDS,
        follow_redirects=True,
    ) as client:
        for index, url in enumerate(selected, start=1):
            echo(f"  [{index}/{len(selected)}] {url.rsplit('/', 1)[-1]}")
            document = download_pdf(url, settings=settings, client=client)
            if document is None:
                continue
            try:
                document.pages = extract_pages(document.path)
            except Exception as exc:  # noqa: BLE001 — one bad PDF must not stop the batch
                logger.warning("pdf_extract_failed url=%s error=%s", url, exc)
                echo(f"      extraction failed: {type(exc).__name__}")
                continue
            echo(f"      {document.page_count} pages")
            documents.append(document)

    return documents
