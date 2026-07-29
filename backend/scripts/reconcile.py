"""Report where the scraped site and the researchers' CSV disagree.

    uv run python scripts/reconcile.py
    uv run python scripts/reconcile.py --csv ../data/knowledge/scaspa_kb_2026-08-04.csv

Writes `data/scraped/reconciliation_YYYY-MM-DD.md` for the researchers.

**This never resolves a conflict.** The handbook says the site is authoritative
for anything SCASPA publishes officially — but "authoritative" is a judgement
about which source a *person* should trust, not a licence for code to overwrite
a researcher's verified row. A fee that differs between the site and the CSV
might be a stale row, or a site page that was never updated, or two genuinely
different fees for two different services. Only a human can tell, and picking
one silently would hide the very disagreement worth knowing about.
"""

import argparse
import re
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.rag.loader import load_kb_csv  # noqa: E402
from app.rag.models import KBRow  # noqa: E402
from app.scraper.site import load_pages  # noqa: E402

# Figures worth comparing. Deliberately narrow: money, times and phone numbers
# are the values where a mismatch changes what someone does.
MONEY = re.compile(r"(?:XCD|EC\$|US\$|USD|\$)\s?\d[\d,]*(?:\.\d{1,2})?", re.IGNORECASE)
TIME = re.compile(r"\b\d{1,2}:\d{2}\s*(?:am|pm)?\b", re.IGNORECASE)
PHONE = re.compile(r"\b(?:\+?1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b")

KINDS = (("money", MONEY), ("time", TIME), ("phone", PHONE))

# Words that suggest a CSV row and a page are about the same thing.
STOP = frozenset(
    "the a an is are do does what when how much of to at for in on and or i my you it there "
    "with from by be this that as your our".split()
)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="reconcile", description="Report disagreements between the site and the CSV."
    )
    parser.add_argument("--csv", type=Path, default=None, help="Knowledge-base CSV.")
    parser.add_argument("--jsonl", type=Path, default=None, help="Scraped JSONL.")
    parser.add_argument("--min-overlap", type=int, default=2, help="Keyword overlap to compare.")
    return parser.parse_args(argv)


def tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 3}


def figures(text: str) -> dict[str, set[str]]:
    """Normalised figures found in some text, by kind."""
    out: dict[str, set[str]] = {}
    for kind, pattern in KINDS:
        values = set()
        for match in pattern.finditer(text):
            value = " ".join(match.group(0).split())
            if kind == "phone":
                value = re.sub(r"\D", "", value)[-7:]  # local part; formats vary wildly
            values.add(value)
        out[kind] = values
    return out


def row_topic(row: KBRow) -> set[str]:
    return tokens(f"{row.category} {row.subcategory} {row.question} {row.keywords}")


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()

    csv_path = args.csv or settings.kb_csv_path
    if not csv_path.exists():
        print(f"error: no knowledge-base CSV at {csv_path}", file=sys.stderr)
        print("       pass --csv, or set KB_CSV_PATH", file=sys.stderr)
        return 1

    jsonl_path = args.jsonl
    if jsonl_path is None:
        candidates = sorted(settings.scraped_path.glob("scaspa_*.jsonl"))
        if not candidates:
            print(
                "error: no scraped JSONL found. Run scripts/crawl_site.py first.", file=sys.stderr
            )
            return 1
        jsonl_path = candidates[-1]

    rows, _ = load_kb_csv(csv_path)
    pages = list(load_pages(jsonl_path))

    print(f"Comparing {len(rows)} CSV rows against {len(pages)} scraped pages")

    page_index = [
        (p, tokens(f"{p.get('title', '')} {p.get('text', '')}"), figures(p.get("text", "")))
        for p in pages
    ]

    conflicts: list[dict] = []
    unmatched: list[KBRow] = []

    for row in rows:
        topic = row_topic(row)
        row_figures = figures(f"{row.question} {row.answer}")
        if not any(row_figures.values()):
            continue  # nothing comparable in this row

        matched_any = False
        for page, page_tokens, page_figures in page_index:
            overlap = topic & page_tokens
            if len(overlap) < args.min_overlap:
                continue
            matched_any = True
            for kind, _ in KINDS:
                mine, theirs = row_figures[kind], page_figures[kind]
                if not mine or not theirs:
                    continue
                if mine & theirs:
                    continue  # they agree on at least one value; good enough to not flag
                conflicts.append(
                    {
                        "kb_id": row.id,
                        "kind": kind,
                        "question": row.question,
                        "csv_values": sorted(mine),
                        "csv_as_of": row.as_of.isoformat(),
                        "csv_source": row.source_url,
                        "page_url": page.get("url", ""),
                        "page_title": page.get("title", ""),
                        "page_values": sorted(theirs),
                        "overlap": sorted(overlap)[:6],
                    }
                )
        if not matched_any:
            unmatched.append(row)

    stamp = datetime.now(UTC).date().isoformat()
    out = settings.scraped_path / f"reconciliation_{stamp}.md"

    by_kind: dict[str, list[dict]] = defaultdict(list)
    for conflict in conflicts:
        by_kind[conflict["kind"]].append(conflict)

    lines = [
        f"# Site vs knowledge base — {stamp}",
        "",
        f"- CSV: `{csv_path.name}` ({len(rows)} valid rows)",
        f"- Scrape: `{jsonl_path.name}` ({len(pages)} pages)",
        f"- **{len(conflicts)} possible disagreement(s)**",
        f"- {len(unmatched)} row(s) with figures that matched no page",
        "",
        "## How to read this",
        "",
        "Nothing here has been resolved, and nothing has been changed. Each entry is a",
        "place where a figure in a researcher's row does not appear on the page that",
        "looks like it covers the same topic.",
        "",
        "The handbook says the site is authoritative for anything SCASPA publishes",
        "officially. That is guidance for **you**, not a rule the code applies — a",
        "mismatch can equally mean the page is stale, or that the two figures are for two",
        "different services. Decide per row, then update the CSV and re-export.",
        "",
        "A match is not proof of agreement either: this compares figures found near",
        "matching keywords, so read the page before acting.",
        "",
    ]

    if conflicts:
        for kind in ("money", "time", "phone"):
            items = by_kind.get(kind, [])
            if not items:
                continue
            lines += [f"## {kind.title()} ({len(items)})", ""]
            for c in items:
                lines += [
                    f"### `{c['kb_id']}` — {c['question']}",
                    "",
                    "| | Value | Source | Verified |",
                    "| --- | --- | --- | --- |",
                    f"| **CSV** | {', '.join(c['csv_values'])} | {c['csv_source']} "
                    f"| {c['csv_as_of']} |",
                    f"| **Site** | {', '.join(c['page_values'])} | <{c['page_url']}> "
                    f"| scraped {stamp} |",
                    "",
                    f"Matched on: {', '.join(c['overlap'])}",
                    "",
                ]
    else:
        lines += [
            "## No disagreements found",
            "",
            "Either they agree, or nothing comparable overlapped.",
            "",
        ]

    if unmatched:
        lines += [
            "## Rows with figures but no matching page",
            "",
            "Not a conflict — the site may simply not publish these. Worth knowing which",
            "facts exist only in the researchers' notes.",
            "",
            *[f"- `{r.id}` {r.question}" for r in unmatched[:60]],
            "",
        ]

    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"  {len(conflicts)} possible disagreement(s)")
    print(f"  wrote {out}")
    print("\nNothing was resolved automatically. A researcher decides each one.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
