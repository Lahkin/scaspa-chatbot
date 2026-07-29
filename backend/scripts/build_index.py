"""Build the Chroma index from the curated knowledge-base CSV.

Usage:

    uv run python scripts/build_index.py
    uv run python scripts/build_index.py --csv ../data/knowledge/sample_kb.csv
    uv run python scripts/build_index.py --force
    uv run python scripts/build_index.py --dry-run

Exit codes: 0 success (including a skipped rebuild), 1 the CSV could not be read
at all, 2 the CSV parsed but produced no indexable rows.
"""

import argparse
import sys
from pathlib import Path

# Allow `python scripts/build_index.py` from backend/ without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.rag.ingest import build_kb_index  # noqa: E402
from app.rag.loader import CSVContractError  # noqa: E402


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="build_index",
        description="Validate the knowledge-base CSV and build the Chroma index.",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Path to the knowledge-base CSV. Defaults to KB_CSV_PATH from settings.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed even when the CSV hash is unchanged.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report only. Embeds nothing and writes no metadata.",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()

    if not args.dry_run and not settings.OPENAI_API_KEY:
        print("error: OPENAI_API_KEY is not set — embedding would fail.", file=sys.stderr)
        print("       Set it in backend/.env, or use --dry-run to validate only.", file=sys.stderr)
        return 1

    try:
        result = build_kb_index(
            csv_path=args.csv,
            force=args.force,
            dry_run=args.dry_run,
            settings=settings,
        )
    except CSVContractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print()
    if result.dry_run:
        print(f"Dry run complete: {result.valid_rows} valid, {result.rejected_rows} rejected.")
    elif result.skipped:
        print(f"Up to date: {result.indexed_rows} rows already indexed. Nothing to do.")
    else:
        print(f"Index built: {result.indexed_rows} rows indexed, {result.rejected_rows} rejected.")

    if result.rejected_rows:
        print(f"Warning: {result.rejected_rows} row(s) rejected — see the report above.")

    if not result.skipped and not result.dry_run and result.indexed_rows == 0:
        print("error: nothing was indexed. The assistant would have no knowledge.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
