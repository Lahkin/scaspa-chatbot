"""Chunk shape tests.

The embedded text shape is fixed by the project handbook. It is asserted
literally here — a drifting format silently changes retrieval quality.
"""

from datetime import date

from app.rag.chunking import (
    WEB_CHUNK_OVERLAP,
    WEB_CHUNK_SIZE,
    build_kb_text,
    chunk_kb_row,
    chunk_kb_rows,
    chunk_web_document,
)
from app.rag.loader import load_kb_csv
from app.rag.models import KBRow

ROW = KBRow(
    id="kb-001",
    category="ferry",
    subcategory="schedule",
    question="Fake question?",
    answer="SAMPLE DATA placeholder answer, fake time 11:11.",
    keywords="alpha|beta|gamma",
    audience="traveller",
    source_url="https://example.invalid/x",
    source_type="official-site",
    as_of=date(2026, 1, 1),
    volatility="low",
    confidence="confirmed",
    notes="internal only, must never be embedded",
)


def test_text_shape_is_exact() -> None:
    assert build_kb_text(ROW) == (
        "Category: ferry — schedule\n"
        "Question: Fake question?\n"
        "Answer: SAMPLE DATA placeholder answer, fake time 11:11.\n"
        "Also known as: alpha, beta, gamma"
    )


def test_pipes_become_commas() -> None:
    assert "Also known as: alpha, beta, gamma" in build_kb_text(ROW)
    assert "|" not in build_kb_text(ROW)


def test_missing_subcategory_drops_the_dash() -> None:
    text = build_kb_text(ROW.model_copy(update={"subcategory": ""}))

    assert text.splitlines()[0] == "Category: ferry"


def test_missing_keywords_drops_the_line() -> None:
    text = build_kb_text(ROW.model_copy(update={"keywords": ""}))

    assert "Also known as" not in text
    assert text.splitlines()[-1].startswith("Answer:")


def test_notes_are_never_embedded_or_stored() -> None:
    """`notes` is internal — CLAUDE.md rule 5 and the CSV contract."""
    doc = chunk_kb_row(ROW)

    assert "internal only" not in doc.page_content
    assert "notes" not in doc.metadata
    assert "internal only" not in str(doc.metadata)


def test_metadata_contract() -> None:
    doc = chunk_kb_row(ROW)

    assert doc.metadata == {
        "id": "kb-001",
        "category": "ferry",
        "subcategory": "schedule",
        "audience": "traveller",
        "source_url": "https://example.invalid/x",
        "source_type": "official-site",
        "as_of": "2026-01-01",
        "volatility": "low",
        "confidence": "confirmed",
        "source_kind": "kb",
    }
    assert doc.id == "kb-001", "the document id is the citation anchor"


def test_money_and_time_survive_verbatim() -> None:
    """CLAUDE.md rule 10 — an answer may only state values present in a chunk."""
    row = ROW.model_copy(update={"answer": "Placeholder fee XCD 111.11 at 04:04."})

    assert "XCD 111.11" in build_kb_text(row)
    assert "04:04" in build_kb_text(row)


def test_one_row_becomes_exactly_one_chunk(sample_csv) -> None:
    valid, _ = load_kb_csv(sample_csv)

    docs = chunk_kb_rows(valid)

    assert len(docs) == len(valid), "rows must never be concatenated or split"
    assert [d.id for d in docs] == [r.id for r in valid]


def test_web_chunking_splits_long_text_with_the_configured_metadata() -> None:
    text = "Placeholder sentence about a fictional facility. " * 120

    docs = chunk_web_document(
        text,
        url="https://example.invalid/page",
        title="Fixture page",
        fetched_at=date(2026, 7, 1),
    )

    assert len(docs) > 1, "text longer than the chunk size must split"
    assert all(len(d.page_content) <= WEB_CHUNK_SIZE for d in docs)
    assert docs[0].metadata == {
        "source_kind": "website",
        "source_url": "https://example.invalid/page",
        "title": "Fixture page",
        "fetched_at": "2026-07-01",
    }


def test_web_chunk_constants_match_the_handbook() -> None:
    assert WEB_CHUNK_SIZE == 800
    assert WEB_CHUNK_OVERLAP == 120
