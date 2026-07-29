"""Diagnostic CLI for eyeballing retrieval quality.

    uv run python scripts/search.py "what time does the ferry leave?"
    uv run python scripts/search.py --k 10 --category ferry "ticket price"
    uv run python scripts/search.py --file questions.txt

This exists so a human can look at retrieval with their own eyes before
trusting anything built on top of it. If the correct row is not in the top
three, retrieval is the problem — no downstream prompt engineering will fix it.

Scores are similarities in 0–1, higher is better (see docs/decisions.md 0003).
Rows scoring below RETRIEVAL_MIN_SCORE are marked, because the answer chain
short-circuits and refuses at that point rather than calling the model.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.rag.retriever import retrieve  # noqa: E402

ANSWER_PREVIEW_CHARS = 100


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="search",
        description="Show the top retrieval hits for a question.",
    )
    parser.add_argument("question", nargs="*", help="The question to search for.")
    parser.add_argument("--k", type=int, default=None, help="How many results (default TOP_K).")
    parser.add_argument("--category", default=None, help="Restrict to one category.")
    parser.add_argument("--source-kind", default=None, help="Restrict to kb or website.")
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Read one question per line from a file and report on each.",
    )
    return parser.parse_args(argv)


def preview(chunk) -> str:
    """First 100 characters of the answer line, whitespace flattened."""
    text = chunk.text
    marker = "Answer:"
    body = text.split(marker, 1)[1].strip() if marker in text else text
    body = " ".join(body.split())
    return body[:ANSWER_PREVIEW_CHARS]


def report(question: str, args, settings) -> bool:
    """Print one question's results. Returns True if anything cleared the floor."""
    chunks = retrieve(
        question,
        k=args.k,
        category=args.category,
        source_kind=args.source_kind,
        settings=settings,
    )

    print()
    print("=" * 100)
    print(f"Q: {question}")
    print("=" * 100)

    if not chunks:
        print("  no results")
        return False

    print(f"  {'#':<3} {'score':<7} {'kb id':<9} {'category':<12} answer (first 100 chars)")
    print("  " + "-" * 96)
    for rank, chunk in enumerate(chunks, start=1):
        flag = "" if chunk.score >= settings.RETRIEVAL_MIN_SCORE else "  <- below MIN_SCORE"
        print(
            f"  {rank:<3} {chunk.score:<7.3f} {chunk.id:<9} "
            f"{chunk.metadata.get('category', ''):<12} {preview(chunk)}{flag}"
        )

    best = chunks[0].score
    if best < settings.RETRIEVAL_MIN_SCORE:
        print()
        print(
            f"  Best score {best:.3f} is below RETRIEVAL_MIN_SCORE "
            f"({settings.RETRIEVAL_MIN_SCORE}). The answer chain would refuse "
            f"without calling the model."
        )
        return False
    return True


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()

    if args.file:
        questions = [
            line.strip()
            for line in args.file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
    else:
        questions = [" ".join(args.question)] if args.question else []

    if not questions:
        print("error: give a question, or --file with one per line", file=sys.stderr)
        return 1

    answered = sum(report(q, args, settings) for q in questions)

    if len(questions) > 1:
        print()
        print("=" * 100)
        print(
            f"{answered}/{len(questions)} questions had SOME hit at or above RETRIEVAL_MIN_SCORE."
        )
        print("This is NOT a correctness measure. It counts any row clearing the floor,")
        print("including a topically-adjacent but wrong one. Read the rows above yourself.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
