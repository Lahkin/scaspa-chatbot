"""Load and validate the researchers' knowledge-base CSV.

Every row lands in exactly one of two buckets: validated `KBRow`s, or
`RejectedRow`s carrying the line number and the specific reason. Nothing is
dropped silently — a row the researchers typed but the assistant never sees is
a bug worth shouting about.
"""

import io
from collections import Counter
from datetime import date
from pathlib import Path

import pandas as pd
from pydantic import ValidationError

from app.rag.models import CSV_HEADER, KBRow, RejectedRow


class CSVContractError(Exception):
    """The file does not match the agreed header contract at all."""


def _strip_leading_comments(text: str) -> tuple[str, int]:
    """Drop a leading `#` comment block.

    Returns the remaining text and how many lines were removed, so reported line
    numbers still match what the researcher sees in their editor.

    Only *leading* comment lines are stripped. A `#` inside a fee or a URL later
    in the file is data, not a comment, and is left alone.
    """
    lines = text.splitlines(keepends=True)
    dropped = 0
    for line in lines:
        if line.lstrip().startswith("#"):
            dropped += 1
        else:
            break
    return "".join(lines[dropped:]), dropped


def load_kb_csv(path: Path | str) -> tuple[list[KBRow], list[RejectedRow]]:
    """Load the knowledge-base CSV.

    Returns `(valid_rows, rejected_rows)`. Raises `CSVContractError` only when the
    file cannot be interpreted as the agreed format at all — a wrong header is a
    problem with the export, not with an individual row.
    """
    path = Path(path)
    if not path.exists():
        raise CSVContractError(f"CSV not found: {path}")

    raw = path.read_text(encoding="utf-8-sig")
    body, comment_lines = _strip_leading_comments(raw)

    # Everything is read as text: a fee of "0900" or an id of "kb-001" must not
    # be coerced into a number, and empty cells must be "" rather than NaN.
    frame = pd.read_csv(
        io.StringIO(body),
        dtype=str,
        keep_default_na=False,
        na_filter=False,
    )

    actual = tuple(c.strip() for c in frame.columns)
    if actual != CSV_HEADER:
        missing = [c for c in CSV_HEADER if c not in actual]
        extra = [c for c in actual if c not in CSV_HEADER]
        detail = []
        if missing:
            detail.append(f"missing columns: {', '.join(missing)}")
        if extra:
            detail.append(f"unexpected columns: {', '.join(extra)}")
        if not detail:
            detail.append("columns are in the wrong order")
        raise CSVContractError(
            f"{path.name} does not match the agreed header contract — {'; '.join(detail)}"
        )

    valid: list[KBRow] = []
    rejected: list[RejectedRow] = []
    seen_ids: dict[str, int] = {}

    for offset, record in enumerate(frame.to_dict(orient="records")):
        # +1 for the header, +1 for 1-based counting, + any stripped comment block.
        line_number = offset + 2 + comment_lines
        row_id = str(record.get("id", "")).strip() or None

        try:
            row = KBRow.model_validate(record)
        except ValidationError as exc:
            rejected.append(
                RejectedRow(
                    row_number=line_number,
                    row_id=row_id,
                    reasons=[_describe(err) for err in exc.errors()],
                )
            )
            continue

        # Citations point at `id`. A duplicate would make a citation ambiguous,
        # so the later occurrence is rejected rather than silently overwriting.
        if row.id in seen_ids:
            rejected.append(
                RejectedRow(
                    row_number=line_number,
                    row_id=row.id,
                    reasons=[f"duplicate id, already used on line {seen_ids[row.id]}"],
                )
            )
            continue

        seen_ids[row.id] = line_number
        valid.append(row)

    return valid, rejected


def _describe(err: dict) -> str:
    """Turn one Pydantic error into a line a researcher can act on."""
    field = ".".join(str(p) for p in err.get("loc", ())) or "row"
    message = err.get("msg", "invalid")
    message = message.removeprefix("Value error, ")
    return f"{field}: {message}"


def summarise(valid: list[KBRow], rejected: list[RejectedRow], source: Path | str = "") -> str:
    """Render the load summary table.

    Returned rather than printed so the caller decides where it goes and tests
    can assert on it.
    """
    total = len(valid) + len(rejected)
    lines: list[str] = []
    add = lines.append

    add("=" * 66)
    add(f"Knowledge base load — {Path(source).name if source else 'CSV'}")
    add("=" * 66)
    add(f"  total rows   : {total}")
    add(f"  valid        : {len(valid)}")
    add(f"  rejected     : {len(rejected)}")

    if rejected:
        add("")
        add("  Rejected by reason")
        add("  " + "-" * 46)
        # Group on the field name so "20 rows missing as_of" reads as one problem.
        by_reason = Counter(
            reason.split(":", 1)[0].strip() for row in rejected for reason in row.reasons
        )
        for reason, count in by_reason.most_common():
            add(f"    {reason:<38} {count:>4}")
        add("")
        add("  Rejected rows (all of them)")
        add("  " + "-" * 46)
        for row in rejected:
            add(f"    {row.format()}")

    if valid:
        for title, counts in (
            ("By category", Counter(r.category for r in valid)),
            ("By confidence", Counter(r.confidence for r in valid)),
            ("By volatility", Counter(r.volatility for r in valid)),
        ):
            add("")
            add(f"  {title}")
            add("  " + "-" * 46)
            for key, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
                add(f"    {key:<38} {count:>4}")

        oldest = oldest_as_of(valid)
        add("")
        add(f"  Oldest as_of : {oldest.isoformat()}")

    add("=" * 66)
    return "\n".join(lines)


def oldest_as_of(rows: list[KBRow]) -> date:
    """The earliest verification date present. Caller must pass a non-empty list."""
    return min(r.as_of for r in rows)
