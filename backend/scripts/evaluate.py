"""Measure the pipeline. Build this before improving anything.

    uv run python scripts/evaluate.py
    uv run python scripts/evaluate.py --csv ../evals/stress_test_sample.csv
    uv run python scripts/evaluate.py --no-query-rewrite --no-category-filter
    uv run python scripts/evaluate.py --sweep-min-score
    uv run python scripts/evaluate.py --label baseline

Writes:
    evals/runs/eval_<ISO-timestamp>.json   full per-question detail
    evals/history.csv                      one summary row per run
    evals/latest.md                        the report, and the failures to file

## Retrieval is scored separately from answers, deliberately

Most failures are retrieval failures. If you only look at final answers you will
spend days tuning prompts to fix a search problem. So retrieval is measured on
its own — hit@1/3/5 and MRR against `expected_kb_id` — and it is the number to
move first.

## Record from the very first run, when the score is bad

`evals/history.csv` is append-only and every run is kept. A graph of accuracy
from the first measurement to the last cannot be reconstructed later, and the
first point being poor is what makes the line mean anything.
"""

import argparse
import csv
import io
import json
import statistics
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings, get_settings  # noqa: E402
from app.rag.ingest import read_index_meta  # noqa: E402
from app.rag.retriever import retrieve  # noqa: E402
from app.rag.rewrite import classify_category, rewrite_query  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVALS_DIR = REPO_ROOT / "evals"
DEFAULT_CSV = EVALS_DIR / "stress_test_sample.csv"

BEHAVIOURS = ("answer", "refuse", "escalate", "correct_premise")
# Behaviours where the assistant must NOT produce a normal cited answer.
MUST_DECLINE = ("refuse", "escalate")

HISTORY_COLUMNS = [
    "timestamp",
    "label",
    "git_sha",
    "kb_version",
    "questions",
    "hit_at_1",
    "hit_at_3",
    "hit_at_5",
    "mrr",
    "fact_recall",
    "false_accept_rate",
    "false_refuse_rate",
    "citation_rate",
    "hallucinated_citations",
    "mean_latency_ms",
    "query_rewrite",
    "category_filter",
    "hybrid",
    "rerank",
    "min_score",
    "top_k",
    "answers_measured",
]


@dataclass
class Case:
    """One stress-test row."""

    question: str
    expected_kb_id: str
    expected_facts: list[str]
    expected_behaviour: str
    history: list[str] = field(default_factory=list)
    failure_mode: str = ""


def load_cases(path: Path) -> list[Case]:
    """Read the stress-test CSV, skipping a leading `#` comment block."""
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines(keepends=True)
    dropped = 0
    for line in lines:
        if line.lstrip().startswith("#"):
            dropped += 1
        else:
            break

    cases: list[Case] = []
    for row in csv.DictReader(io.StringIO("".join(lines[dropped:]))):
        behaviour = (row.get("expected_behaviour") or "").strip()
        if behaviour not in BEHAVIOURS:
            raise ValueError(
                f"row {row.get('question')!r}: expected_behaviour must be one of "
                f"{', '.join(BEHAVIOURS)}, got {behaviour!r}"
            )
        cases.append(
            Case(
                question=(row.get("question") or "").strip(),
                expected_kb_id=(row.get("expected_kb_id") or "").strip(),
                expected_facts=[
                    f.strip() for f in (row.get("expected_facts") or "").split("|") if f.strip()
                ],
                expected_behaviour=behaviour,
                history=[h.strip() for h in (row.get("history") or "").split("|") if h.strip()],
                failure_mode=(row.get("failure_mode") or "").strip(),
            )
        )
    return cases


@dataclass
class CaseResult:
    """Everything measured for one question."""

    question: str
    failure_mode: str
    expected_kb_id: str
    expected_behaviour: str

    retrieved_ids: list[str] = field(default_factory=list)
    retrieved_scores: list[float] = field(default_factory=list)
    rank: int | None = None
    effective_query: str = ""
    category_used: str | None = None

    answer: str = ""
    answered: bool = False
    refused: bool = False
    refusal_category: str | None = None
    facts_found: list[str] = field(default_factory=list)
    facts_missing: list[str] = field(default_factory=list)
    cited_ids: list[str] = field(default_factory=list)
    hallucinated_citations: list[str] = field(default_factory=list)
    grounded: bool = False
    latency_ms: int = 0
    error: str = ""

    @property
    def retrieval_hit_1(self) -> bool:
        return self.rank == 1

    @property
    def retrieval_hit_3(self) -> bool:
        return self.rank is not None and self.rank <= 3

    @property
    def retrieval_hit_5(self) -> bool:
        return self.rank is not None and self.rank <= 5

    @property
    def reciprocal_rank(self) -> float:
        return 1.0 / self.rank if self.rank else 0.0

    @property
    def fact_recall(self) -> float:
        total = len(self.facts_found) + len(self.facts_missing)
        return len(self.facts_found) / total if total else 1.0

    @property
    def should_decline(self) -> bool:
        return self.expected_behaviour in MUST_DECLINE

    @property
    def false_accept(self) -> bool:
        """Answered something it was required to decline. The dangerous direction."""
        return self.should_decline and self.answered

    @property
    def false_refuse(self) -> bool:
        """Declined something it should have answered."""
        return (not self.should_decline) and self.refused

    @property
    def passed(self) -> bool:
        """Whether this case is a success overall.

        A retrieval miss counts as a failure even when nothing was generated.
        Without that clause the report cheerfully said "None. Every case passed"
        for a question whose expected row was never retrieved — the worst kind of
        wrong, because it is a green light over a broken search.
        """
        if self.error:
            return False
        if self.should_decline:
            return not self.answered
        if self.expected_kb_id and self.rank is None:
            return False
        if self.refused:
            return False
        return not self.facts_missing and not self.hallucinated_citations


def score_retrieval(case: Case, chunks) -> tuple[int | None, list[str], list[float]]:  # noqa: ANN001
    ids = [c.id for c in chunks]
    scores = [round(c.score, 4) for c in chunks]
    rank = (ids.index(case.expected_kb_id) + 1) if case.expected_kb_id in ids else None
    return rank, ids, scores


def score_facts(answer: str, expected: list[str]) -> tuple[list[str], list[str]]:
    """Which expected strings appear in the answer.

    Whitespace is normalised first so a line break inside a figure is not a miss.
    """
    haystack = " ".join(answer.split()).lower()
    found = [f for f in expected if " ".join(f.split()).lower() in haystack]
    missing = [f for f in expected if f not in found]
    return found, missing


def run_case(
    case: Case,
    settings: Settings,
    *,
    retrieval_only: bool,
    embeddings=None,  # noqa: ANN001
    chat_model=None,  # noqa: ANN001
) -> CaseResult:
    """Run one question through retrieval and, unless disabled, the full chain."""
    result = CaseResult(
        question=case.question,
        failure_mode=case.failure_mode,
        expected_kb_id=case.expected_kb_id,
        expected_behaviour=case.expected_behaviour,
    )
    started = time.perf_counter()

    try:
        chunks = retrieve(
            case.question,
            k=max(settings.RETRIEVAL_TOP_K, 5),
            history=case.history,
            embeddings=embeddings,
            settings=settings,
        )
    except Exception as exc:  # noqa: BLE001 — a broken case must not stop the run
        result.error = f"retrieval: {type(exc).__name__}: {exc}"
        return result

    result.rank, result.retrieved_ids, result.retrieved_scores = score_retrieval(case, chunks)
    result.effective_query = (
        rewrite_query(case.question, case.history)
        if settings.RETRIEVAL_QUERY_REWRITE
        else case.question
    )
    result.category_used = (
        classify_category(result.effective_query) if settings.RETRIEVAL_CATEGORY_FILTER else None
    )

    if retrieval_only:
        result.latency_ms = int((time.perf_counter() - started) * 1000)
        return result

    from app.rag.answer import answer_question

    try:
        answer = answer_question(
            case.question, settings=settings, chat_model=chat_model, embeddings=embeddings
        )
    except Exception as exc:  # noqa: BLE001
        result.error = f"answer: {type(exc).__name__}: {exc}"
        result.latency_ms = int((time.perf_counter() - started) * 1000)
        return result

    result.answer = answer.answer
    result.refused = answer.refusal
    result.refusal_category = answer.refusal_category
    result.answered = not answer.refusal
    result.cited_ids = answer.cited_ids
    result.hallucinated_citations = answer.hallucinated_citations
    result.grounded = answer.grounded
    result.facts_found, result.facts_missing = score_facts(answer.answer, case.expected_facts)
    result.latency_ms = answer.latency_ms or int((time.perf_counter() - started) * 1000)
    return result


def aggregate(results: list[CaseResult], answers_measured: bool) -> dict:
    """Roll per-question results into the four metric families."""
    total = len(results)
    with_expected = [r for r in results if r.expected_kb_id]
    should_decline = [r for r in results if r.should_decline]
    should_answer = [r for r in results if not r.should_decline]
    answered = [r for r in results if r.answered]

    def rate(numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 4) if denominator else 0.0

    aggregates: dict = {
        "questions": total,
        "answers_measured": answers_measured,
        "retrieval": {
            "scored_questions": len(with_expected),
            "hit_at_1": rate(sum(r.retrieval_hit_1 for r in with_expected), len(with_expected)),
            "hit_at_3": rate(sum(r.retrieval_hit_3 for r in with_expected), len(with_expected)),
            "hit_at_5": rate(sum(r.retrieval_hit_5 for r in with_expected), len(with_expected)),
            "mrr": round(
                statistics.fmean([r.reciprocal_rank for r in with_expected])
                if with_expected
                else 0.0,
                4,
            ),
        },
    }

    if not answers_measured:
        aggregates["note"] = (
            "Answer, refusal and citation metrics were NOT measured: no OPENAI_API_KEY, "
            "so the chat model was never called. The retrieval numbers are real."
        )
        return aggregates

    aggregates |= {
        "answers": {
            "fact_recall": round(
                statistics.fmean([r.fact_recall for r in should_answer]) if should_answer else 0.0,
                4,
            ),
            "fully_correct": rate(
                sum(1 for r in should_answer if not r.facts_missing and r.answered),
                len(should_answer),
            ),
        },
        "refusals": {
            "should_decline": len(should_decline),
            "false_accept_rate": rate(
                sum(r.false_accept for r in should_decline), len(should_decline)
            ),
            "false_refuse_rate": rate(
                sum(r.false_refuse for r in should_answer), len(should_answer)
            ),
        },
        "citations": {
            "answers_with_a_citation": rate(sum(1 for r in answered if r.cited_ids), len(answered)),
            "grounded_rate": rate(sum(1 for r in answered if r.grounded), len(answered)),
            "hallucinated_citations": sum(len(r.hallucinated_citations) for r in results),
        },
        "latency": {
            "mean_ms": int(statistics.fmean([r.latency_ms for r in results])) if results else 0,
            "p95_ms": int(sorted(r.latency_ms for r in results)[max(int(total * 0.95) - 1, 0)])
            if total
            else 0,
        },
        "pass_rate": rate(sum(r.passed for r in results), total),
    }
    return aggregates


def git_sha() -> str:
    try:
        return subprocess.run(  # noqa: S603
            ["git", "rev-parse", "--short", "HEAD"],  # noqa: S607
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def retrieval_config(settings: Settings) -> dict:
    return {
        "query_rewrite": settings.RETRIEVAL_QUERY_REWRITE,
        "category_filter": settings.RETRIEVAL_CATEGORY_FILTER,
        "hybrid": settings.RETRIEVAL_HYBRID,
        "rerank": settings.RETRIEVAL_RERANK,
        "min_score": settings.RETRIEVAL_MIN_SCORE,
        "top_k": settings.RETRIEVAL_TOP_K,
        "fetch_k": settings.RETRIEVAL_FETCH_K,
        "embedding_model": settings.OPENAI_EMBEDDING_MODEL,
    }


def write_run(
    results: list[CaseResult], aggregates: dict, settings: Settings, label: str, timestamp: str
) -> Path:
    EVALS_DIR.joinpath("runs").mkdir(parents=True, exist_ok=True)
    meta = read_index_meta(settings)
    payload = {
        "timestamp": timestamp,
        "label": label,
        "git_sha": git_sha(),
        "kb_version": meta.kb_version if meta else None,
        "kb_rows_indexed": meta.kb_rows_indexed if meta else None,
        "retrieval_config": retrieval_config(settings),
        "aggregates": aggregates,
        "cases": [asdict(r) for r in results],
    }
    path = EVALS_DIR / "runs" / f"eval_{timestamp.replace(':', '-')}.json"
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    return path


def append_history(aggregates: dict, settings: Settings, label: str, timestamp: str) -> Path:
    """Append one row. Never rewrites history — the trend is the point."""
    path = EVALS_DIR / "history.csv"
    meta = read_index_meta(settings)
    retrieval = aggregates["retrieval"]
    answers = aggregates.get("answers", {})
    refusals = aggregates.get("refusals", {})
    citations = aggregates.get("citations", {})

    row = {
        "timestamp": timestamp,
        "label": label,
        "git_sha": git_sha(),
        "kb_version": meta.kb_version if meta else "",
        "questions": aggregates["questions"],
        "hit_at_1": retrieval["hit_at_1"],
        "hit_at_3": retrieval["hit_at_3"],
        "hit_at_5": retrieval["hit_at_5"],
        "mrr": retrieval["mrr"],
        "fact_recall": answers.get("fact_recall", ""),
        "false_accept_rate": refusals.get("false_accept_rate", ""),
        "false_refuse_rate": refusals.get("false_refuse_rate", ""),
        "citation_rate": citations.get("answers_with_a_citation", ""),
        "hallucinated_citations": citations.get("hallucinated_citations", ""),
        "mean_latency_ms": aggregates.get("latency", {}).get("mean_ms", ""),
        "query_rewrite": settings.RETRIEVAL_QUERY_REWRITE,
        "category_filter": settings.RETRIEVAL_CATEGORY_FILTER,
        "hybrid": settings.RETRIEVAL_HYBRID,
        "rerank": settings.RETRIEVAL_RERANK,
        "min_score": settings.RETRIEVAL_MIN_SCORE,
        "top_k": settings.RETRIEVAL_TOP_K,
        "answers_measured": aggregates["answers_measured"],
    }

    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=HISTORY_COLUMNS)
        if new:
            writer.writeheader()
        writer.writerow(row)
    return path


def write_report(
    results: list[CaseResult], aggregates: dict, settings: Settings, label: str, timestamp: str
) -> Path:
    """Write `evals/latest.md` — the aggregates plus every failure, for filing."""
    path = EVALS_DIR / "latest.md"
    meta = read_index_meta(settings)
    retrieval = aggregates["retrieval"]

    lines = [
        f"# Evaluation — {timestamp}",
        "",
        f"- Label: **{label or '(none)'}**",
        f"- Commit: `{git_sha()}`",
        f"- Knowledge base: `{meta.kb_version if meta else 'none'}` "
        f"({meta.kb_rows_indexed if meta else 0} rows indexed)",
        f"- Questions: **{aggregates['questions']}**",
        "",
        "## Retrieval — fix this first",
        "",
        "Most failures are retrieval failures. Tuning prompts to fix a search problem",
        "wastes days, so this is measured separately and moved first.",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| hit@1 | **{retrieval['hit_at_1']:.0%}** |",
        f"| hit@3 | {retrieval['hit_at_3']:.0%} |",
        f"| hit@5 | {retrieval['hit_at_5']:.0%} |",
        f"| MRR | {retrieval['mrr']:.3f} |",
        f"| Questions with an expected row | {retrieval['scored_questions']} |",
        "",
        "## Configuration",
        "",
        "| Setting | Value |",
        "| --- | --- |",
        *[f"| `{key}` | `{value}` |" for key, value in retrieval_config(settings).items()],
        "",
    ]

    if not aggregates["answers_measured"]:
        lines += [
            "## Answers, refusals and citations — NOT MEASURED",
            "",
            "> No `OPENAI_API_KEY`, so the chat model was never called. The retrieval",
            "> numbers above are real; everything downstream of generation is **absent,",
            "> not zero**. Re-run with a key to fill this in.",
            "",
        ]
    else:
        answers = aggregates["answers"]
        refusals = aggregates["refusals"]
        citations = aggregates["citations"]
        latency = aggregates["latency"]
        lines += [
            "## Answer correctness",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Expected facts present (recall) | **{answers['fact_recall']:.0%}** |",
            f"| Fully correct answers | {answers['fully_correct']:.0%} |",
            "",
            "## Refusal behaviour",
            "",
            "| Metric | Value | Reading |",
            "| --- | --- | --- |",
            f"| False accept | **{refusals['false_accept_rate']:.0%}** | "
            "answered when it had to decline — the dangerous direction |",
            f"| False refuse | {refusals['false_refuse_rate']:.0%} | "
            "declined something it could have answered |",
            "",
            "## Citations",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Answers carrying a citation | {citations['answers_with_a_citation']:.0%} |",
            f"| Grounded (ids and figures verified) | {citations['grounded_rate']:.0%} |",
            f"| Citations stripped as hallucinated | **{citations['hallucinated_citations']}** |",
            "",
            "## Latency",
            "",
            f"- mean {latency['mean_ms']} ms, p95 {latency['p95_ms']} ms",
            "",
            f"## Overall pass rate: {aggregates['pass_rate']:.0%}",
            "",
        ]

    failures = [r for r in results if not r.passed]
    lines += [
        f"## Failures ({len(failures)})",
        "",
        "One GitHub issue per row. Give the researchers the question, what came back,",
        "and what was expected — they can act on that without reading code.",
        "",
    ]
    if not failures:
        lines.append("None. Every case passed.")
    for result in failures:
        retrieved = (
            ", ".join(
                f"`{i}`({s:.2f})"
                for i, s in zip(result.retrieved_ids, result.retrieved_scores, strict=False)
            )
            or "_nothing_"
        )
        lines += [
            f"### {result.question}",
            "",
            f"- **Failure mode:** {result.failure_mode or 'unlabelled'}",
            f"- **Expected behaviour:** {result.expected_behaviour}",
            f"- **Expected row:** `{result.expected_kb_id or '(none)'}` — "
            + (f"found at rank {result.rank}" if result.rank else "**NOT RETRIEVED**"),
            f"- **Retrieved:** {retrieved}",
        ]
        if result.effective_query != result.question:
            lines.append(f"- **Query after rewriting:** `{result.effective_query}`")
        if result.category_used:
            lines.append(f"- **Category filter applied:** `{result.category_used}`")
        if result.error:
            lines.append(f"- **Error:** `{result.error}`")
        if aggregates["answers_measured"]:
            lines += [
                f"- **Answered:** {result.answered} (refusal={result.refused})",
                f"- **Missing facts:** "
                f"{', '.join(f'`{f}`' for f in result.facts_missing) or 'none'}",
                f"- **Citations:** {', '.join(f'`{c}`' for c in result.cited_ids) or 'none'}",
            ]
            if result.hallucinated_citations:
                lines.append(
                    "- **Hallucinated citations stripped:** "
                    + ", ".join(f"`{c}`" for c in result.hallucinated_citations)
                )
            if result.answer:
                lines += ["", "> " + " ".join(result.answer.split())[:400]]
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="evaluate", description="Score retrieval, answers, refusals and citations."
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Stress-test CSV.")
    parser.add_argument("--label", default="", help="Short name for this run, e.g. 'baseline'.")
    parser.add_argument(
        "--retrieval-only",
        action="store_true",
        help="Score retrieval only. Automatic when no OPENAI_API_KEY is set.",
    )
    for flag, setting in (
        ("query-rewrite", "RETRIEVAL_QUERY_REWRITE"),
        ("category-filter", "RETRIEVAL_CATEGORY_FILTER"),
        ("hybrid", "RETRIEVAL_HYBRID"),
        ("rerank", "RETRIEVAL_RERANK"),
    ):
        parser.add_argument(f"--{flag}", dest=setting, action="store_true", default=None)
        parser.add_argument(f"--no-{flag}", dest=setting, action="store_false", default=None)
    parser.add_argument("--min-score", type=float, default=None, help="Override MIN_SCORE.")
    parser.add_argument(
        "--sweep-min-score",
        action="store_true",
        help="Try a range of thresholds and print the trade-off table. Writes no run file.",
    )
    parser.add_argument("--quiet", action="store_true", help="Print only the summary.")
    return parser.parse_args(argv)


def apply_overrides(settings: Settings, args) -> Settings:  # noqa: ANN001
    updates = {}
    for setting in (
        "RETRIEVAL_QUERY_REWRITE",
        "RETRIEVAL_CATEGORY_FILTER",
        "RETRIEVAL_HYBRID",
        "RETRIEVAL_RERANK",
    ):
        value = getattr(args, setting, None)
        if value is not None:
            updates[setting] = value
    if args.min_score is not None:
        updates["RETRIEVAL_MIN_SCORE"] = args.min_score
    return settings.model_copy(update=updates) if updates else settings


def sweep_min_score(cases: list[Case], settings: Settings, embeddings=None) -> float:  # noqa: ANN001
    """Find the threshold that maximises correct refusals without suppressing answers.

    Retrieval-only, so it needs no model. For each candidate threshold, count how
    many should-answer questions still have their correct row above the floor, and
    how many should-decline questions the floor rejects on its own.
    """
    print("\nRETRIEVAL_MIN_SCORE sweep")
    print("=" * 78)
    print(f"  {'threshold':>9}  {'answerable kept':>18}  {'declines caught':>18}  {'net':>6}")
    print("  " + "-" * 74)

    scored = []
    for case in cases:
        chunks = retrieve(
            case.question,
            k=settings.RETRIEVAL_TOP_K,
            history=case.history,
            embeddings=embeddings,
            settings=settings,
        )
        best = chunks[0].score if chunks else 0.0
        available = bool(case.expected_kb_id and case.expected_kb_id in [c.id for c in chunks])
        scored.append((case, best, available))

    should_answer = [s for s in scored if s[0].expected_behaviour not in MUST_DECLINE]
    should_decline = [s for s in scored if s[0].expected_behaviour in MUST_DECLINE]

    best_threshold, best_net = 0.0, -1.0
    for step in range(21):
        threshold = round(step * 0.05, 2)
        kept = sum(1 for _, score, available in should_answer if score >= threshold and available)
        caught = sum(1 for _, score, _ in should_decline if score < threshold)
        # Suppressing a real answer and letting a refusal through are both bad;
        # weight them equally and take the peak rather than a taste.
        net = (kept / max(len(should_answer), 1)) + (caught / max(len(should_decline), 1))
        if net > best_net:
            best_threshold, best_net = threshold, net
        print(
            f"  {threshold:>9.2f}  {kept:>8}/{len(should_answer):<9}  "
            f"{caught:>8}/{len(should_decline):<9}  {net:>6.2f}"
        )

    print("  " + "-" * 74)
    print(f"  Best combined score at threshold {best_threshold} (net {best_net:.2f}).")
    print("  'answerable kept' = should-answer questions whose correct row is retrieved")
    print("  AND clears the floor. 'declines caught' = should-decline questions the floor")
    print("  rejects on its own, before the model is ever called.")
    return best_threshold


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = apply_overrides(get_settings(), args)

    if not args.csv.exists():
        print(f"error: no stress-test CSV at {args.csv}", file=sys.stderr)
        return 1

    meta = read_index_meta(settings)
    if meta is None or meta.kb_rows_indexed == 0:
        print("error: no index. Run scripts/build_index.py first.", file=sys.stderr)
        return 1

    cases = load_cases(args.csv)
    retrieval_only = args.retrieval_only or not settings.OPENAI_API_KEY
    if retrieval_only and not args.retrieval_only:
        print("No OPENAI_API_KEY: scoring retrieval only. Answer metrics will be absent.\n")

    if args.sweep_min_score:
        sweep_min_score(cases, settings)
        return 0

    print(f"Evaluating {len(cases)} questions against kb {meta.kb_version}")
    print(
        f"  config: rewrite={settings.RETRIEVAL_QUERY_REWRITE} "
        f"category={settings.RETRIEVAL_CATEGORY_FILTER} "
        f"hybrid={settings.RETRIEVAL_HYBRID} rerank={settings.RETRIEVAL_RERANK} "
        f"min_score={settings.RETRIEVAL_MIN_SCORE}"
    )
    print()

    results: list[CaseResult] = []
    for index, case in enumerate(cases, start=1):
        result = run_case(case, settings, retrieval_only=retrieval_only)
        results.append(result)
        if not args.quiet:
            # In retrieval-only mode PASS/FAIL would be meaningless: nothing was
            # answered, so every should-decline case trivially "passes". Show the
            # retrieval outcome instead, which is what was actually measured.
            if retrieval_only:
                if not case.expected_kb_id:
                    mark = " -- "
                elif result.rank == 1:
                    mark = "HIT1"
                elif result.rank:
                    mark = f"HIT{result.rank}"
                else:
                    mark = "MISS"
            else:
                mark = "PASS" if result.passed else "FAIL"
            rank = f"rank {result.rank}" if result.rank else "not retrieved"
            print(f"  [{index:>2}/{len(cases)}] {mark}  {rank:<14} {case.question[:52]}")

    aggregates = aggregate(results, answers_measured=not retrieval_only)
    timestamp = datetime.now(UTC).isoformat(timespec="seconds")

    run_path = write_run(results, aggregates, settings, args.label, timestamp)
    history_path = append_history(aggregates, settings, args.label, timestamp)
    report_path = write_report(results, aggregates, settings, args.label, timestamp)

    retrieval = aggregates["retrieval"]
    print()
    print("=" * 78)
    print(
        f"  RETRIEVAL  hit@1 {retrieval['hit_at_1']:.0%}  hit@3 {retrieval['hit_at_3']:.0%}  "
        f"hit@5 {retrieval['hit_at_5']:.0%}  MRR {retrieval['mrr']:.3f}"
    )
    if aggregates["answers_measured"]:
        print(
            f"  ANSWERS    fact recall {aggregates['answers']['fact_recall']:.0%}  "
            f"pass {aggregates['pass_rate']:.0%}"
        )
        print(
            f"  REFUSALS   false accept {aggregates['refusals']['false_accept_rate']:.0%}  "
            f"false refuse {aggregates['refusals']['false_refuse_rate']:.0%}"
        )
        print(
            f"  CITATIONS  cited {aggregates['citations']['answers_with_a_citation']:.0%}  "
            f"hallucinated {aggregates['citations']['hallucinated_citations']}"
        )
    else:
        print("  ANSWERS    not measured (no API key)")
    print("=" * 78)
    print(f"  run     -> {run_path.relative_to(REPO_ROOT)}")
    print(f"  history -> {history_path.relative_to(REPO_ROOT)}")
    print(f"  report  -> {report_path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
