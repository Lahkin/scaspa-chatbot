"""Compare pypdf, pdfplumber and PyMuPDF on a real SCASPA PDF.

    uv run python scripts/pdf_bakeoff.py
    uv run python scripts/pdf_bakeoff.py --url https://www.scaspa.com/uploads/.../x.pdf --page 12

Writes each library's output plus a side-by-side comparison of the same page to
`data/scraped/pdf_bakeoff/`.

**A human must read the output and choose.** The decision is which library keeps
a tariff or financial table readable as a table — not which has the most
downloads. A column that collapses into the wrong row turns one fee into
another, and a wrong number here is money.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.scraper.site import assert_not_blocked  # noqa: E402

# A real SCASPA document with genuine financial tables. Chosen over the policy
# PDFs because table structure is the whole point of the comparison.
DEFAULT_PDF = (
    "https://www.scaspa.com/uploads/9/5/2/1/95213570/scaspa_audited_financial_statements_2024.pdf"
)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="pdf_bakeoff", description="Compare three PDF extractors on a real SCASPA document."
    )
    parser.add_argument("--url", default=DEFAULT_PDF, help="PDF to test.")
    parser.add_argument("--page", type=int, default=None, help="1-based page for the comparison.")
    parser.add_argument("--max-pages", type=int, default=12, help="Pages to extract per library.")
    return parser.parse_args(argv)


def download(url: str, destination: Path) -> Path:
    """Fetch the PDF, honouring the blocklist."""
    settings = get_settings()
    assert_not_blocked(url, settings)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        print(f"  using cached {destination.name} ({destination.stat().st_size:,} bytes)")
        return destination
    print(f"  downloading {url}")
    with httpx.Client(
        headers={"User-Agent": settings.SCRAPER_USER_AGENT}, timeout=90.0, follow_redirects=True
    ) as client:
        response = client.get(url)
        response.raise_for_status()
        destination.write_bytes(response.content)
    print(f"  saved {destination.name} ({destination.stat().st_size:,} bytes)")
    return destination


def extract_pypdf(path: Path, max_pages: int) -> list[str]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return [(page.extract_text() or "") for page in reader.pages[:max_pages]]


def extract_pdfplumber(path: Path, max_pages: int) -> list[str]:
    import pdfplumber

    out: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text() or ""
            # pdfplumber can also emit tables explicitly; that is the thing
            # being judged, so include it.
            tables = page.extract_tables() or []
            if tables:
                rendered = []
                for index, table in enumerate(tables):
                    rendered.append(f"\n--- TABLE {index + 1} (pdfplumber) ---")
                    for row in table:
                        rendered.append(" | ".join((cell or "").strip() for cell in row))
                text = f"{text}\n" + "\n".join(rendered)
            out.append(text)
    return out


def extract_pymupdf(path: Path, max_pages: int) -> list[str]:
    import pymupdf

    document = pymupdf.open(str(path))
    try:
        return [document[i].get_text() for i in range(min(max_pages, document.page_count))]
    finally:
        document.close()


def score_table_shape(text: str) -> dict:
    """Crude, honest signals about whether a table survived.

    Not a verdict. It gives a human something to look at first — a page of
    financial tables should produce lines with several numbers on them, and
    numbers that end up alone on their own line have usually lost their row.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()]
    numeric_lines = [ln for ln in lines if sum(c.isdigit() for c in ln) >= 4]
    lone_numbers = [ln for ln in lines if ln.strip().replace(",", "").replace(".", "").isdigit()]
    multi_column = [ln for ln in numeric_lines if len(ln.split()) >= 4]
    return {
        "chars": len(text),
        "lines": len(lines),
        "numeric_lines": len(numeric_lines),
        "multi_column_lines": len(multi_column),
        "lone_number_lines": len(lone_numbers),
    }


def pick_table_page(pages: list[str]) -> int:
    """The page that looks most like a table, for the side-by-side."""
    best, best_score = 0, -1
    for index, text in enumerate(pages):
        stats = score_table_shape(text)
        score = stats["multi_column_lines"] * 2 + stats["numeric_lines"]
        if score > best_score:
            best, best_score = index, score
    return best


def main(argv=None) -> int:
    args = parse_args(argv)
    settings = get_settings()
    out_dir = settings.scraped_path / "pdf_bakeoff"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("PDF extraction bake-off")
    print("=" * 70)
    pdf_path = download(args.url, out_dir / Path(args.url).name)

    extractors = {
        "pypdf": extract_pypdf,
        "pdfplumber": extract_pdfplumber,
        "pymupdf": extract_pymupdf,
    }

    results: dict[str, list[str]] = {}
    for name, fn in extractors.items():
        print(f"\n  extracting with {name} …")
        try:
            results[name] = fn(pdf_path, args.max_pages)
        except Exception as exc:  # noqa: BLE001 — a failure here is a real result
            print(f"    FAILED: {type(exc).__name__}: {exc}")
            results[name] = []
            continue
        full = "\n\n".join(f"=== page {i + 1} ===\n{t}" for i, t in enumerate(results[name]))
        (out_dir / f"{name}.txt").write_text(full, encoding="utf-8")
        print(f"    {len(results[name])} pages, {len(full):,} chars -> {name}.txt")

    usable = {k: v for k, v in results.items() if v}
    if not usable:
        print("\nevery extractor failed; nothing to compare", file=sys.stderr)
        return 1

    page_index = (args.page - 1) if args.page else pick_table_page(next(iter(usable.values())))
    print(f"\n  comparing page {page_index + 1} (chosen as the most table-like)")

    lines = [
        "# PDF extraction bake-off",
        "",
        f"Source: <{args.url}>",
        f"Comparison page: {page_index + 1} (1-based)",
        "",
        "Read the three renderings below and choose on whether the **table is still a",
        "table**. Character counts are not the criterion — a library can extract every",
        "character and still scramble which fee belongs to which service.",
        "",
        "## Signals (per library, this page)",
        "",
        "| Library | chars | lines | numeric lines | multi-column lines | lone numbers |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for name, pages in results.items():
        if not pages or page_index >= len(pages):
            lines.append(f"| {name} | — | — | — | — | — |")
            continue
        s = score_table_shape(pages[page_index])
        lines.append(
            f"| {name} | {s['chars']:,} | {s['lines']} | {s['numeric_lines']} | "
            f"{s['multi_column_lines']} | {s['lone_number_lines']} |"
        )

    lines += [
        "",
        "**multi-column lines** are lines carrying four or more whitespace-separated",
        "tokens including several digits — a row that survived. **lone numbers** are",
        "lines containing nothing but a number, which usually means a cell was torn out",
        "of its row. High multi-column and low lone-number is what we want.",
        "",
    ]

    for name, pages in results.items():
        lines += [f"## {name}", "", "```"]
        lines += [
            (pages[page_index] if pages and page_index < len(pages) else "(no output)")[:4000]
        ]
        lines += ["```", ""]

    comparison = out_dir / "comparison.md"
    comparison.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n  wrote {comparison}")
    print("\nNow read comparison.md and record the choice in docs/decisions.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
