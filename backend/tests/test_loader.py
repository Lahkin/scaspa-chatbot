"""Loader validation tests.

The rule under test throughout: a row is either valid or rejected *with a
reason*. Nothing is ever silently dropped.
"""

from pathlib import Path

import pytest

from app.rag.loader import CSVContractError, load_kb_csv, summarise
from app.rag.models import CSV_HEADER

HEADER = ",".join(CSV_HEADER)

# A well-formed fixture row. Obviously fake — CLAUDE.md rule 5.
GOOD = (
    "kb-001,ferry,schedule,Fake question?,SAMPLE DATA placeholder answer 11:11,"
    "alpha|beta,traveller,https://example.invalid/x,official-site,2026-01-01,low,confirmed,note"
)


def write_csv(tmp_path: Path, *rows: str, header: str = HEADER) -> Path:
    path = tmp_path / "kb.csv"
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return path


def test_valid_row_loads(tmp_path: Path) -> None:
    valid, rejected = load_kb_csv(write_csv(tmp_path, GOOD))

    assert rejected == []
    assert len(valid) == 1
    assert valid[0].id == "kb-001"
    assert valid[0].keyword_list == ["alpha", "beta"]


@pytest.mark.parametrize(
    ("field", "bad_value", "expect_in_reason"),
    [
        ("id", "kb-1", "id"),
        ("id", "001", "id"),
        ("id", "KB-001", "id"),
        ("as_of", "04/08/2026", "as_of"),
        ("as_of", "not-a-date", "as_of"),
        ("volatility", "extreme", "volatility"),
        ("confidence", "maybe", "confidence"),
        ("source_type", "blog", "source_type"),
        ("audience", "everyone", "audience"),
        ("question", "", "question"),
        ("answer", "", "answer"),
        ("source_url", "", "source_url"),
        ("category", "", "category"),
    ],
)
def test_invalid_field_is_rejected_with_a_reason(
    tmp_path: Path, field: str, bad_value: str, expect_in_reason: str
) -> None:
    cells = GOOD.split(",")
    cells[CSV_HEADER.index(field)] = bad_value

    valid, rejected = load_kb_csv(write_csv(tmp_path, ",".join(cells)))

    assert valid == []
    assert len(rejected) == 1, "the row must be rejected, never silently dropped"
    assert rejected[0].row_number == 2
    assert expect_in_reason in " ".join(rejected[0].reasons)


def test_rejection_carries_line_number_and_id(tmp_path: Path) -> None:
    bad = GOOD.replace("kb-001", "kb-002").replace("2026-01-01", "nope")
    valid, rejected = load_kb_csv(write_csv(tmp_path, GOOD, bad))

    assert len(valid) == 1
    assert len(rejected) == 1
    assert rejected[0].row_number == 3, "line 1 is the header, so the second row is line 3"
    assert rejected[0].row_id == "kb-002"


def test_duplicate_id_is_rejected(tmp_path: Path) -> None:
    """Citations point at `id`, so a duplicate would make a citation ambiguous."""
    valid, rejected = load_kb_csv(write_csv(tmp_path, GOOD, GOOD))

    assert len(valid) == 1
    assert len(rejected) == 1
    assert "duplicate id" in rejected[0].reasons[0]


def test_no_row_is_ever_lost(tmp_path: Path) -> None:
    rows = [
        GOOD,
        GOOD.replace("kb-001", "kb-002").replace("low", "bogus"),
        GOOD.replace("kb-001", "kb-0003"),
        GOOD.replace("kb-001", "bad-id"),
    ]
    valid, rejected = load_kb_csv(write_csv(tmp_path, *rows))

    assert len(valid) + len(rejected) == len(rows)


def test_wrong_header_raises_contract_error(tmp_path: Path) -> None:
    path = write_csv(tmp_path, header="id,question,answer")

    with pytest.raises(CSVContractError, match="header contract"):
        load_kb_csv(path)


def test_missing_file_raises_contract_error(tmp_path: Path) -> None:
    with pytest.raises(CSVContractError, match="not found"):
        load_kb_csv(tmp_path / "absent.csv")


def test_leading_comment_block_is_skipped_and_line_numbers_stay_true(tmp_path: Path) -> None:
    path = tmp_path / "kb.csv"
    bad = GOOD.replace("2026-01-01", "nope")
    path.write_text(f"# a comment\n# another\n{HEADER}\n{bad}\n", encoding="utf-8")

    valid, rejected = load_kb_csv(path)

    assert valid == []
    assert rejected[0].row_number == 4, "line number must match what the researcher sees"


def test_sample_fixture_loads_cleanly(sample_csv: Path) -> None:
    valid, rejected = load_kb_csv(sample_csv)

    assert rejected == []
    assert len(valid) == 12
    assert len({r.category for r in valid}) >= 4
    assert all(r.source_url.startswith("https://example.invalid/") for r in valid)


def test_summary_reports_the_required_facts(sample_csv: Path) -> None:
    valid, rejected = load_kb_csv(sample_csv)

    summary = summarise(valid, rejected, sample_csv)

    assert "total rows : 12" in summary.replace("   ", " ").replace("  ", " ")
    assert "By category" in summary
    assert "By confidence" in summary
    assert "By volatility" in summary
    assert "Oldest as_of : 2025-08-20" in summary
