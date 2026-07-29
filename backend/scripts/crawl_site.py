"""Crawl scaspa.com. Run on demand — never from a request handler.

    uv run python scripts/crawl_site.py                 # full crawl + PDFs
    uv run python scripts/crawl_site.py --limit 5       # a quick look
    uv run python scripts/crawl_site.py --no-pdfs
    uv run python scripts/crawl_site.py --include-port-zante   # see below

Writes:
    data/scraped/scaspa_YYYY-MM-DD.jsonl   one record per page
    data/scraped/flagged_for_client.md     things a human must resolve
    data/scraped/diff_YYYY-MM-DD.md        what changed since last time
    data/scraped/pdfs/                     downloaded PDFs
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.scraper.pdfs import collect_pdfs  # noqa: E402
from app.scraper.site import (  # noqa: E402
    BlockedURLError,
    Crawler,
    RobotsDisallowedError,
    diff_report,
    load_state,
    save_state,
    write_flagged_report,
    write_jsonl,
)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="crawl_site", description="Crawl scaspa.com politely.")
    parser.add_argument("--limit", type=int, default=None, help="Max pages to fetch.")
    parser.add_argument("--no-pdfs", action="store_true", help="Skip PDF downloads.")
    parser.add_argument("--pdf-limit", type=int, default=None, help="Max PDFs to download.")
    parser.add_argument(
        "--include-port-zante",
        action="store_true",
        help=(
            "Also crawl portzante.com. OFF by default — handbook open question 17. "
            "It is a separate operator's site and crawling it would republish their "
            "content as SCASPA's. Do not enable without written client confirmation."
        ),
    )
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between requests.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()

    if args.include_port_zante:
        print("WARNING: portzante.com included. Handbook open question 17 is unresolved.")
        print("         Only proceed with written client confirmation.\n")

    previous = load_state(settings)

    try:
        with Crawler(
            settings=settings,
            include_port_zante=args.include_port_zante,
            delay=args.delay,
        ) as crawler:
            report = crawler.crawl(limit=args.limit)
    except RobotsDisallowedError as exc:
        print(f"\nSTOPPED: {exc}", file=sys.stderr)
        return 2
    except BlockedURLError as exc:
        print(f"\nBLOCKED: {exc}", file=sys.stderr)
        return 3

    print()
    print(report.summary())

    jsonl = write_jsonl(report, settings)
    flagged = write_flagged_report(report, settings)
    diff = diff_report(previous, report, settings)
    save_state(report, settings)

    print()
    print(f"  pages   -> {jsonl}")
    print(f"  flagged -> {flagged}")
    print(f"  diff    -> {diff}")

    if not args.no_pdfs and report.pdf_urls:
        print()
        print(f"Downloading {len(report.pdf_urls)} PDFs…")
        documents = collect_pdfs(report.pdf_urls, settings=settings, limit=args.pdf_limit)
        pages = sum(d.page_count for d in documents)
        print(f"  {len(documents)} PDFs, {pages} pages extracted")

    flagged_count = len(report.flagged)
    if flagged_count:
        print()
        print(f"{flagged_count} item(s) flagged for the client and NOT indexed.")
        print(f"Read {flagged.name} and get real values from SCASPA.")

    print()
    print("Next: uv run python scripts/build_index.py --web")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
