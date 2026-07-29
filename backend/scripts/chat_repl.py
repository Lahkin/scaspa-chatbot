"""Interactive terminal REPL — the Gate 1 artefact.

    uv run python scripts/chat_repl.py
    uv run python scripts/chat_repl.py --ask "how much is a ferry ticket?"

For every question it prints the answer, then a clearly separated block showing
every chunk that was retrieved with its score and id, and which of those ended
up cited. The point is that a human can see exactly which knowledge-base rows
produced the answer — and, just as importantly, which retrieved rows the model
ignored.

`--ask` runs a single question and exits, so the same code path can be driven
from a script.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.rag.answer import AnswerResult, answer_question  # noqa: E402

RULE = "=" * 78
THIN = "-" * 78


def render(result: AnswerResult, settings) -> None:
    """Print an answer and the full retrieval provenance behind it."""
    print()
    print(RULE)
    print("ANSWER")
    print(RULE)
    print(result.answer)

    print()
    print(RULE)
    print("RETRIEVAL — every chunk considered")
    print(RULE)

    if not result.retrieved:
        print("  (nothing retrieved)")
    else:
        cited = set(result.cited_ids)
        print(f"  {'kb id':<9} {'score':<7} {'cited':<7} {'conf':<10} category")
        print("  " + THIN[:74])
        for chunk in result.retrieved:
            below = "" if chunk.score >= settings.RETRIEVAL_MIN_SCORE else " (below floor)"
            print(
                f"  {chunk.id:<9} {chunk.score:<7.3f} "
                f"{'YES' if chunk.id in cited else 'no':<7} "
                f"{chunk.metadata.get('confidence', ''):<10} "
                f"{chunk.metadata.get('category', '')}{below}"
            )

    print()
    print(THIN)
    print("ROWS USED (verified citations, built from stored metadata)")
    print(THIN)
    if result.citations:
        for citation in result.citations:
            print(f"  [{citation.kb_id}] verified {citation.as_of} — {citation.source_url}")
            print(
                f"            {citation.category}/{citation.subcategory} "
                f"· {citation.source_type} · confidence={citation.confidence}"
            )
    else:
        print("  none — no verified citation was attached to this answer")

    if result.hallucinated_citations:
        print()
        print("  !! HALLUCINATED CITATIONS STRIPPED: " + ", ".join(result.hallucinated_citations))
        print("     The model cited rows that were never retrieved. Markers removed from the")
        print("     answer text above and the response marked ungrounded.")

    if result.unverified_figures:
        print()
        print("  !! UNVERIFIED FIGURES: " + ", ".join(result.unverified_figures))
        print("     These money/time values appear in no retrieved chunk (CLAUDE.md rule 10).")
        print("     The answer is marked ungrounded.")

    if result.refusal_category:
        print()
        print(f"  Refused by the deterministic gate: {result.refusal_category}")

    print()
    print(THIN)
    print(
        f"  grounded={result.grounded}  refusal={result.refusal}  "
        f"best_score={result.best_score:.3f}  model={result.model or '(not called)'}  "
        f"latency={result.latency_ms}ms"
    )
    print(THIN)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="chat_repl",
        description="Ask the SCASPA assistant a question and see its sources.",
    )
    parser.add_argument("--ask", default=None, help="Ask one question, print, exit.")
    parser.add_argument("--k", type=int, default=None, help="How many chunks to retrieve.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()

    if not settings.OPENAI_API_KEY:
        print("error: OPENAI_API_KEY is not set — the chat model cannot be called.")
        print("       Set it in backend/.env. Retrieval alone can be inspected with:")
        print('       uv run python scripts/search.py "your question"')
        return 1

    if args.ask:
        render(answer_question(args.ask, k=args.k, settings=settings), settings)
        return 0

    print(RULE)
    print("SCASPA assistant — Gate 1 REPL")
    print("Answers come only from the verified knowledge base. Ctrl-D or 'quit' to exit.")
    print(RULE)

    while True:
        try:
            question = input("\nyou> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0

        if not question:
            continue
        if question.lower() in {"quit", "exit", ":q"}:
            return 0

        try:
            render(answer_question(question, k=args.k, settings=settings), settings)
        except Exception as exc:  # noqa: BLE001 — a REPL must survive one bad turn
            print(f"\nerror: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
