"""Export an anonymised CSV of what people actually asked.

    uv run python scripts/export_questions.py
    uv run python scripts/export_questions.py --since 2026-07-01 --out questions.csv
    uv run python scripts/export_questions.py --gaps

This is what the team hands SCASPA, and it feeds the researchers' gaps list
directly: an unanswered or ungrounded question is a missing knowledge-base row.

## What is in it, and what is not

Each row is a question, a timestamp, and whether it was answered and grounded.

There is **no** IP address, no user agent, no session or device identifier, and
not even the conversation id — including that would let two questions be linked
into one person's visit, which is exactly the inference this avoids. The source
file (`data/questions.jsonl`) never contains those fields either; this script
cannot omit what was never written.

That is what makes the export shareable: it is a record of *questions*, not of
*people*.
"""

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402

COLUMNS = [
    "timestamp",
    "question",
    "answered",
    "grounded",
    "refusal",
    "refusal_category",
    "cited_ids",
]

# Fields that must never appear in the export, even if a future writer adds them
# to the source file. Checked rather than assumed.
FORBIDDEN = ("ip", "client_ip", "user_agent", "session_id", "user_id", "conversation_id", "cookie")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="export_questions", description="Anonymised CSV of questions asked."
    )
    parser.add_argument("--log", type=Path, default=None, help="Source JSONL.")
    parser.add_argument("--out", type=Path, default=None, help="Output CSV.")
    parser.add_argument("--since", default=None, help="Only questions on or after this ISO date.")
    parser.add_argument(
        "--gaps",
        action="store_true",
        help="Print the questions that were NOT answered or NOT grounded — the gaps list.",
    )
    return parser.parse_args(argv)


def load(path: Path, since: date | None) -> list[dict]:
    records: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except ValueError:
                print(f"  skipping malformed line {line_number}", file=sys.stderr)
                continue

            leaked = [f for f in FORBIDDEN if f in record]
            if leaked:
                raise SystemExit(
                    f"REFUSING TO EXPORT: {path} line {line_number} contains {leaked}. "
                    "The question log must never hold an identifier (CLAUDE.md rule 9). "
                    "Fix the writer before exporting."
                )

            if since:
                stamp = record.get("ts", "")
                try:
                    if datetime.fromisoformat(stamp).date() < since:
                        continue
                except ValueError:
                    pass
            records.append(record)
    return records


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()
    log_path = args.log or settings.question_log_path

    if not log_path.exists():
        print(f"No question log at {log_path}.", file=sys.stderr)
        print("It is written as questions are asked; none have been yet.", file=sys.stderr)
        return 1

    since = date.fromisoformat(args.since) if args.since else None
    records = load(log_path, since)

    if not records:
        print("No questions in range.")
        return 0

    out_path = args.out or (log_path.parent / f"questions_{date.today().isoformat()}.csv")
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "timestamp": record.get("ts", ""),
                    "question": record.get("question", ""),
                    "answered": record.get("answered", ""),
                    "grounded": record.get("grounded", ""),
                    "refusal": record.get("refusal", ""),
                    "refusal_category": record.get("refusal_category") or "",
                    "cited_ids": " ".join(record.get("cited_ids") or []),
                }
            )

    answered = sum(1 for r in records if r.get("answered"))
    grounded = sum(1 for r in records if r.get("grounded"))
    gaps = [r for r in records if not r.get("answered") or not r.get("grounded")]

    print(f"{len(records)} questions -> {out_path}")
    print(f"  answered : {answered} ({answered / len(records):.0%})")
    print(f"  grounded : {grounded} ({grounded / len(records):.0%})")
    print(f"  gaps     : {len(gaps)}")
    print("\n  No identifiers are included: no IP, no user agent, no session,")
    print("  and deliberately not the conversation id either.")

    if args.gaps and gaps:
        print("\nGAPS — each of these is a candidate knowledge-base row")
        print("=" * 70)
        for question, count in Counter(r.get("question", "") for r in gaps).most_common(40):
            print(f"  {count:>3}x  {question[:64]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
