"""Pre-demo check. Run this five minutes before presenting.

    uv run python scripts/preflight.py --url https://YOUR-URL
    uv run python scripts/preflight.py --url http://127.0.0.1:8000 --skip-voice
    uv run python scripts/preflight.py --url https://YOUR-URL --warm-only

Exits non-zero if anything fails, so it can gate a deploy.

Written to be read while nervous: one line per check, PASS or FAIL, the number
that mattered, and nothing else. If it is all green you can present.
"""

import argparse
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

# The four questions the demo actually asks. Keep this list in sync with the
# script, and keep it short — a preflight that takes two minutes will not be run.
DEMO_QUESTIONS = [
    ("How much is a ferry ticket to Nevis?", "ferry fare"),
    ("What is the container handling charge?", "cargo tariff"),
    ("When is the cargo gate open?", "cargo hours"),
    ("How do I contact SCASPA?", "contact"),
]
REFUSAL_QUESTION = "Where is my container right now?"
CHART_QUESTION = "Show me cruise passengers by month"

DEFAULT_LATENCY_BUDGET_MS = 8000


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""
    warn: bool = False


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)
    latencies: list[float] = field(default_factory=list)

    def add(self, name: str, passed: bool, detail: str = "", warn: bool = False) -> bool:
        self.checks.append(Check(name, passed, detail, warn))
        colour = GREEN if passed else (YELLOW if warn else RED)
        label = "PASS" if passed else ("WARN" if warn else "FAIL")
        print(f"  {colour}{label}{RESET}  {name:<44} {DIM}{detail}{RESET}")
        return passed

    @property
    def failed(self) -> list[Check]:
        return [c for c in self.checks if not c.passed and not c.warn]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="preflight", description="Pre-demo checks.")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL to check.")
    parser.add_argument("--kb-version", default=None, help="Expected kb_version, e.g. 2026-08-04.")
    parser.add_argument("--min-rows", type=int, default=1, help="Minimum indexed rows.")
    parser.add_argument(
        "--latency-ms", type=int, default=DEFAULT_LATENCY_BUDGET_MS, help="Per-question budget."
    )
    parser.add_argument("--skip-voice", action="store_true", help="Skip /api/stt and /api/tts.")
    parser.add_argument("--skip-chart", action="store_true", help="Skip the chart question.")
    parser.add_argument("--skip-ratelimit", action="store_true", help="Skip the rate-limit probe.")
    parser.add_argument(
        "--warm-only",
        action="store_true",
        help="Just wake the service and report cold-start time. Run this first.",
    )
    return parser.parse_args(argv)


class RateLimitHit(RuntimeError):
    """The check ran into the rate limiter, so its result means nothing.

    Worth its own type. Reporting "the refusal guardrail failed" when the truth is
    "you used your quota" would send a nervous presenter chasing a bug that is not
    there — which is exactly what happened the first time this script ran.
    """


def post_chat(client: httpx.Client, question: str, timeout: float = 60.0) -> tuple[dict, float]:
    """POST /api/chat, raising `RateLimitHit` on a 429."""
    started = time.perf_counter()
    response = client.post("/api/chat", json={"message": question}, timeout=timeout)
    elapsed = (time.perf_counter() - started) * 1000
    if response.status_code == 429:
        raise RateLimitHit(f"Retry-After: {response.headers.get('Retry-After', '?')}s")
    response.raise_for_status()
    return response.json(), elapsed


def wav_bytes(seconds: float = 1.0, rate: int = 16000) -> bytes:
    """A tiny silent WAV, so /api/stt can be probed without a recording."""
    import struct

    data = b"\x00\x00" * int(seconds * rate)
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(data))
        + b"WAVE"
        + b"fmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data"
        + struct.pack("<I", len(data))
        + data
    )


def warm_up(client: httpx.Client, report: Report) -> float:
    """Wake the service and measure how long the first response took.

    On a free tier the first request after idling pays the cold start. Knowing
    the number is the difference between opening the app early on purpose and
    watching a spinner in front of judges.
    """
    started = time.perf_counter()
    try:
        response = client.get("/api/health", timeout=90.0)
        elapsed = (time.perf_counter() - started) * 1000
    except httpx.HTTPError as exc:
        report.add("API reachable", False, f"{type(exc).__name__}")
        return -1.0

    ok = response.status_code == 200
    report.add("API reachable", ok, f"HTTP {response.status_code}, first byte {elapsed:.0f}ms")
    if elapsed > 5000:
        report.add(
            "cold start",
            True,
            f"{elapsed / 1000:.1f}s — open the app "
            f"{max(1, int(elapsed / 1000 / 60) + 1)} min early",
            warn=True,
        )
    else:
        report.add("cold start", True, f"{elapsed:.0f}ms — warm")
    return elapsed


def check_health(client: httpx.Client, report: Report, args) -> dict:  # noqa: ANN001
    try:
        body = client.get("/api/health", timeout=30.0).json()
    except (httpx.HTTPError, ValueError) as exc:
        report.add("/api/health readable", False, str(exc)[:60])
        return {}

    index = body.get("index", {})
    report.add(
        "health status ok",
        body.get("status") == "ok",
        f"status={body.get('status')} env={body.get('env')}",
    )
    report.add(
        "index ready",
        bool(index.get("ready")),
        index.get("message") or f"{index.get('kb_rows')} rows",
    )
    rows = index.get("kb_rows") or 0
    report.add("index row count", rows >= args.min_rows, f"{rows} rows (need >= {args.min_rows})")

    if args.kb_version:
        actual = index.get("kb_version")
        report.add(
            "kb_version matches",
            actual == args.kb_version,
            f"expected {args.kb_version}, got {actual}",
        )
    else:
        report.add(
            "kb_version",
            True,
            f"{index.get('kb_version')} (pass --kb-version to assert it)",
            warn=True,
        )
    return body


def check_demo_questions(client: httpx.Client, report: Report, args) -> None:  # noqa: ANN001
    for question, label in DEMO_QUESTIONS:
        try:
            body, elapsed = post_chat(client, question)
        except RateLimitHit as exc:
            report.add(
                f"demo: {label}",
                False,
                f"RATE LIMITED ({exc}) — wait a minute and rerun, this is not a bug",
            )
            continue
        except (httpx.HTTPError, ValueError) as exc:
            report.add(f"demo: {label}", False, f"{type(exc).__name__}")
            continue

        report.latencies.append(elapsed)
        cited = [c["kb_id"] for c in body.get("citations", [])]
        problems = []
        if body.get("refusal"):
            problems.append("REFUSED")
        if not cited:
            problems.append("no citation")
        if not body.get("grounded"):
            problems.append("not grounded")
        if body.get("meta", {}).get("hallucinated_citations"):
            problems.append("hallucinated citation")
        if elapsed > args.latency_ms:
            problems.append(f"slow {elapsed:.0f}ms")

        report.add(
            f"demo: {label}",
            not problems,
            "; ".join(problems) if problems else f"{elapsed:.0f}ms, cited {','.join(cited)}",
        )


def check_refusal(client: httpx.Client, report: Report) -> None:
    try:
        body, _ = post_chat(client, REFUSAL_QUESTION)
    except RateLimitHit as exc:
        report.add(
            "refusal holds",
            False,
            f"RATE LIMITED ({exc}) — result unknown, not a guardrail failure. Rerun.",
        )
        return
    except (httpx.HTTPError, ValueError) as exc:
        report.add("refusal holds", False, f"{type(exc).__name__}")
        return

    refused = bool(body.get("refusal"))
    report.add(
        "refusal holds",
        refused,
        f"category={body.get('refusal_category')}" if refused else "IT ANSWERED — do not demo this",
    )


def check_chart(client: httpx.Client, report: Report) -> None:
    try:
        body, _ = post_chat(client, CHART_QUESTION)
    except RateLimitHit as exc:
        report.add("chart question", False, f"RATE LIMITED ({exc}) — rerun", warn=True)
        return
    except (httpx.HTTPError, ValueError) as exc:
        report.add("chart question", False, f"{type(exc).__name__}")
        return

    chart = body.get("chart")
    if not chart:
        report.add("chart question", False, "no chart returned", warn=True)
        return

    problems = []
    if chart.get("type") not in ("line", "bar", "area"):
        problems.append(f"bad type {chart.get('type')}")
    if not chart.get("caption"):
        problems.append("no caption")
    if not chart.get("series") or not chart["series"][0].get("points"):
        problems.append("no points")
    report.add(
        "chart question",
        not problems,
        "; ".join(problems) or f"{chart['type']}, {len(chart['series'][0]['points'])} points",
    )


def check_voice(client: httpx.Client, report: Report) -> None:
    try:
        response = client.post(
            "/api/stt", files={"audio": ("probe.wav", wav_bytes(), "audio/wav")}, timeout=60.0
        )
        ok = response.status_code == 200
        report.add("/api/stt responds", ok, f"HTTP {response.status_code}")
    except httpx.HTTPError as exc:
        report.add("/api/stt responds", False, f"{type(exc).__name__}")

    try:
        response = client.post("/api/tts", json={"text": "The fare is XCD 44.44."}, timeout=60.0)
        ok = response.status_code == 200 and response.headers.get("content-type", "").startswith(
            "audio/"
        )
        report.add(
            "/api/tts responds",
            ok,
            f"HTTP {response.status_code}, {len(response.content)} bytes, "
            f"cache={response.headers.get('x-tts-cache')}",
        )
    except httpx.HTTPError as exc:
        report.add("/api/tts responds", False, f"{type(exc).__name__}")


def args_probe_count() -> int:
    """How many pings to send when probing the limiter.

    Bounded deliberately: the probe itself costs requests and burns the presenter's
    own quota for the next minute.
    """
    return 40


def check_rate_limit(client: httpx.Client, report: Report) -> None:
    """Confirm the limiter is on by deliberately tripping it.

    This burns the client's budget for the next minute, so it runs LAST.
    """
    codes = []
    for _ in range(args_probe_count()):
        try:
            codes.append(
                client.post("/api/chat", json={"message": "ping"}, timeout=30.0).status_code
            )
        except httpx.HTTPError:
            break
        if codes[-1] == 429:
            break

    tripped = 429 in codes
    if tripped and len(codes) <= 2:
        # Already limited when the probe started: proves the limiter runs, but
        # says nothing about its threshold.
        report.add("rate limiting active", True, "429 immediately — budget already spent")
    elif tripped:
        report.add("rate limiting active", True, f"429 after {len(codes)} requests")
    else:
        # A warning, not a failure. Either the limiter is off or the limit is above
        # the probe count — both worth knowing, neither worth blocking a demo over.
        report.add(
            "rate limiting active",
            True,
            f"no 429 in {len(codes)} requests — limiter off, or "
            f"RATE_LIMIT_PER_MINUTE > {len(codes)}. Check /api/admin/stats.",
            warn=True,
        )

    if tripped:
        print(
            f"  {DIM}      note: this used up this machine's quota for ~1 minute. "
            f"Wait before demoing.{RESET}"
        )


def main(argv=None) -> int:
    args = parse_args(argv)
    base = args.url.rstrip("/")

    print()
    print("=" * 78)
    print(f"  PREFLIGHT  {base}")
    print("=" * 78)

    report = Report()
    with httpx.Client(base_url=base, timeout=60.0, follow_redirects=True) as client:
        cold_ms = warm_up(client, report)
        if cold_ms < 0:
            print()
            print(f"{RED}  API is not reachable. See docs/runbook.md section 1.{RESET}")
            return 1

        if args.warm_only:
            print()
            print(f"  Warm. Cold start was {cold_ms:.0f}ms.")
            return 0

        check_health(client, report, args)
        check_demo_questions(client, report, args)
        check_refusal(client, report)
        if not args.skip_chart:
            check_chart(client, report)
        if not args.skip_voice:
            check_voice(client, report)
        # Last: it consumes the rate-limit budget.
        if not args.skip_ratelimit:
            check_rate_limit(client, report)

    print("=" * 78)
    if report.latencies:
        print(
            f"  latency  mean {statistics.fmean(report.latencies):.0f}ms  "
            f"max {max(report.latencies):.0f}ms  budget {args.latency_ms}ms"
        )

    failed = report.failed
    if failed:
        print(f"  {RED}{len(failed)} CHECK(S) FAILED{RESET}")
        for check in failed:
            print(f"    - {check.name}: {check.detail}")
        print(f"\n  {RED}Do not present until these are green. See docs/runbook.md.{RESET}")
        return 1

    warnings = [c for c in report.checks if c.warn]
    print(
        f"  {GREEN}ALL CHECKS PASSED{RESET}" + (f" ({len(warnings)} warning)" if warnings else "")
    )
    print(f"\n  {DIM}Cold start {cold_ms:.0f}ms. Open the app before the judges arrive.{RESET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
