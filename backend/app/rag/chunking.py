"""Turn source material into embeddable chunks.

Two very different jobs:

* `chunk_kb_row` — one curated CSV row becomes exactly **one** chunk. Rows are
  never concatenated. A citation points at a single `id`, so a chunk that mixed
  two rows could not be cited honestly.
* `chunk_web_document` — free-form scraped pages get split by length. Not called
  yet; the scraper does not exist.

Money and time values must survive into a chunk verbatim, because an answer may
only state them if they appear verbatim in a retrieved chunk (CLAUDE.md rule 10).
Never post-process, round or reformat the `answer` text.
"""

from datetime import date

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.rag.models import KBRow

WEB_CHUNK_SIZE = 800
WEB_CHUNK_OVERLAP = 120

SOURCE_KIND_KB = "kb"
SOURCE_KIND_WEB = "website"


def build_kb_text(row: KBRow) -> str:
    """Build the embedded text for one knowledge-base row.

    The shape is fixed by the project handbook::

        Category: {category} — {subcategory}
        Question: {question}
        Answer: {answer}
        Also known as: {keywords, comma separated}

    Two allowances for sparse data: the ` — {subcategory}` suffix is dropped when
    there is no subcategory, and the `Also known as:` line is dropped entirely
    when a row has no keywords. Emitting a dangling label with nothing after it
    would put a meaningless token in the embedding.

    `notes` is internal and never appears here.
    """
    category = row.category
    if row.subcategory:
        category = f"{category} — {row.subcategory}"

    lines = [
        f"Category: {category}",
        f"Question: {row.question}",
        f"Answer: {row.answer}",
    ]

    keywords = row.keyword_list
    if keywords:
        lines.append(f"Also known as: {', '.join(keywords)}")

    return "\n".join(lines)


def build_kb_metadata(row: KBRow) -> dict[str, str]:
    """Metadata attached to a knowledge-base chunk but *not* embedded.

    `notes` is excluded deliberately: it is internal commentary and must never
    reach a user or an embedding.

    Values are all strings because Chroma only accepts scalar metadata; `as_of`
    is stored as an ISO date string.
    """
    return {
        "id": row.id,
        "category": row.category,
        "subcategory": row.subcategory,
        "audience": row.audience,
        "source_url": row.source_url,
        "source_type": row.source_type,
        "as_of": row.as_of.isoformat(),
        "volatility": row.volatility,
        "confidence": row.confidence,
        "source_kind": SOURCE_KIND_KB,
    }


def chunk_kb_row(row: KBRow) -> Document:
    """Convert one validated row into exactly one `Document`."""
    return Document(
        id=row.id,
        page_content=build_kb_text(row),
        metadata=build_kb_metadata(row),
    )


def chunk_kb_rows(rows: list[KBRow]) -> list[Document]:
    """Convert rows one-for-one. `len(output) == len(input)`, always."""
    return [chunk_kb_row(row) for row in rows]


def chunk_web_document(
    text: str,
    url: str,
    title: str,
    fetched_at: date,
) -> list[Document]:
    """Split a scraped page into overlapping chunks.

    Not called yet — provided for the scraper. Unlike knowledge-base rows, web
    text has no curated boundaries, so it is split by length with overlap to
    avoid cutting a fee or a sailing time in half at a chunk edge.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=WEB_CHUNK_SIZE,
        chunk_overlap=WEB_CHUNK_OVERLAP,
    )
    metadata = {
        "source_kind": SOURCE_KIND_WEB,
        "source_url": url,
        "title": title,
        "fetched_at": fetched_at.isoformat(),
    }
    return splitter.create_documents([text], metadatas=[metadata])
