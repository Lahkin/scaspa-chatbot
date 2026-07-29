"""Scraper tests.

The blocklist tests come first because they are the ones that matter most:
pay.scaspa.com is a live payment portal and CLAUDE.md rule 3 forbids fetching,
testing against, or linking to it. No test here performs any network I/O.
"""

import json

import pytest
from bs4 import BeautifulSoup

from app.config import Settings
from app.scraper.site import (
    EMAIL_PLACEHOLDER,
    STAT_PLACEHOLDER,
    BlockedURLError,
    Crawler,
    CrawlReport,
    FlaggedItem,
    ScrapedPage,
    _find_zero_stats,
    _is_boilerplate_value,
    _quarantine_emails,
    _strip_boilerplate,
    assert_not_blocked,
    diff_report,
    is_blocked,
    is_in_scope,
    write_flagged_report,
    write_jsonl,
)

# ------------------------------------------------------------- THE BLOCKLIST


@pytest.mark.parametrize(
    "url",
    [
        "https://pay.scaspa.com",
        "https://pay.scaspa.com/",
        "http://pay.scaspa.com/checkout",
        "https://PAY.SCASPA.COM/Pay",
        "https://pay.scaspa.com/anything?amount=100",
    ],
)
def test_payment_portal_raises_never_skips(url: str, tmp_settings) -> None:
    """CLAUDE.md rule 3. An exception, not a filter.

    A skip is a decision the code makes silently. An exception is one a human
    has to look at. This must never be downgraded.
    """
    with pytest.raises(BlockedURLError, match="pay.scaspa.com"):
        assert_not_blocked(url, tmp_settings)


def test_blocked_url_is_detected(tmp_settings) -> None:
    assert is_blocked("https://pay.scaspa.com/x", tmp_settings) is True
    assert is_blocked("https://www.scaspa.com/contact.html", tmp_settings) is False


def test_crawler_fetch_refuses_a_blocked_url(tmp_settings) -> None:
    """The guard sits in fetch(), so no code path can reach the portal."""
    crawler = Crawler(settings=tmp_settings, sleep=lambda _: None)
    try:
        with pytest.raises(BlockedURLError):
            crawler.fetch("https://pay.scaspa.com/checkout")
    finally:
        crawler.close()


def test_blocklist_is_configurable(tmp_settings) -> None:
    settings = tmp_settings.model_copy(
        update={"SCRAPER_BLOCKLIST": "pay.scaspa.com,secret.example"}
    )

    with pytest.raises(BlockedURLError):
        assert_not_blocked("https://secret.example/page", settings)


def test_pdf_download_refuses_a_blocked_url(tmp_settings) -> None:
    from app.scraper.pdfs import download_pdf

    with pytest.raises(BlockedURLError):
        download_pdf("https://pay.scaspa.com/receipt.pdf", settings=tmp_settings)


# ------------------------------------------------------------------- scope


def test_scaspa_is_in_scope() -> None:
    assert is_in_scope("https://www.scaspa.com/cargo.html") is True
    assert is_in_scope("https://scaspa.com/cargo.html") is True


def test_port_zante_is_out_of_scope_by_default() -> None:
    """Handbook open question 17 — a separate operator's site."""
    assert is_in_scope("https://portzante.com/x") is False
    assert is_in_scope("https://portzante.com/x", include_port_zante=True) is True


def test_third_party_sites_are_out_of_scope() -> None:
    assert is_in_scope("https://example.com/") is False


# --------------------------------------------------- TRAP 1: zero statistics

HOMEPAGE_STATS = """
<html><body><div class="stats">
  <p>Annual Statistics Based on 2025</p>
  <div><span>0</span><span>Vessel Calls</span></div>
  <div><span>0</span><span>Flights</span></div>
  <div><span>0</span><span>Cruise Passengers</span></div>
  <div><span>0</span><span>Tonnes of Cargo</span></div>
</div></body></html>
"""


def test_zero_statistics_are_detected_with_correct_labels() -> None:
    """All four, each with its own label.

    The first implementation looked at the preceding line first, which attached
    each zero to the previous counter's label — "Vessel Calls" was reported
    twice and "Tonnes of Cargo" not at all, so nobody would have known to chase
    the cargo figure.
    """
    labels = _find_zero_stats(BeautifulSoup(HOMEPAGE_STATS, "lxml"))

    assert labels == ["Vessel Calls", "Flights", "Cruise Passengers", "Tonnes of Cargo"]


def test_zero_statistics_never_reach_the_stored_text(tmp_settings) -> None:
    """The single worst outcome in this pipeline is a scraped zero being served."""
    crawler = Crawler(settings=tmp_settings, sleep=lambda _: None)
    report = CrawlReport()
    try:
        page = crawler.parse("https://www.scaspa.com/index.html", HOMEPAGE_STATS, report)
    finally:
        crawler.close()

    assert len(report.flagged) == 4
    assert all(f.kind == "javascript_zero_stat" for f in report.flagged)
    # No line in the stored text is a bare zero...
    assert not [ln for ln in page.text.splitlines() if ln.strip() == "0"]
    # ...because each was actively replaced, not merely noticed. Flagging alone
    # left the zeros in the text; they only vanished on the live page by luck.
    assert page.text.count(STAT_PLACEHOLDER) == 4
    assert "Vessel Calls" in page.text, "the label stays; only the false figure goes"


def test_real_numbers_are_not_flagged() -> None:
    html = "<html><body><div><span>412</span><span>Vessel Calls</span></div></body></html>"

    assert _find_zero_stats(BeautifulSoup(html, "lxml")) == []


# ------------------------------------------------------ TRAP 2: email addresses

CF_EMAIL = """
<html><body><p>Write to
<a href="/cdn-cgi/l/email-protection" class="__cf_email__"
   data-cfemail="94fbf0e1f7f0d4f1e0f5e6f5">[email&#160;protected]</a>
for details.</p></body></html>
"""


def test_obfuscated_email_is_replaced_not_decoded() -> None:
    """The encoding is trivially reversible; that is not the point.

    SCASPA obfuscated the address deliberately, and a scraped address is
    unverified anyway. The real one comes from the client.
    """
    soup = BeautifulSoup(CF_EMAIL, "lxml")

    count = _quarantine_emails(soup)
    text = soup.get_text()

    assert count >= 1
    assert EMAIL_PLACEHOLDER in text
    assert "data-cfemail" not in str(soup)
    assert "94fbf0e1" not in text, "the encoded placeholder must not be stored either"
    assert "@" not in text.replace(EMAIL_PLACEHOLDER, "")


def test_email_page_is_flagged(tmp_settings) -> None:
    crawler = Crawler(settings=tmp_settings, sleep=lambda _: None)
    report = CrawlReport()
    try:
        page = crawler.parse("https://www.scaspa.com/contact.html", CF_EMAIL, report)
    finally:
        crawler.close()

    assert any(f.kind == "obfuscated_email" for f in report.flagged)
    assert EMAIL_PLACEHOLDER in page.text


# ------------------------------------------------------------- text extraction


def test_content_container_named_not_footer_survives() -> None:
    """Weebly names the main content wrapper `wsite-not-footer`.

    A substring match on "footer" deleted the entire article — pages extracted
    to 20 characters. Anything containing `not-` is content.
    """
    assert _is_boilerplate_value("wsite-elements wsite-not-footer") is False
    assert _is_boilerplate_value("wsite-elements wsite-footer") is True


def test_body_tag_is_never_decomposed() -> None:
    """The body carries class="header-page", which would delete the document."""
    html = """<html><body class="header-page wsite-page-our-history">
        <div class="wsite-not-footer"><p>Before 1993, the airport and seaport
        operated as two separate entities.</p></div>
        <div class="footer">contact us</div></body></html>"""
    soup = BeautifulSoup(html, "lxml")

    _strip_boilerplate(soup)
    text = soup.get_text()

    assert "Before 1993" in text
    assert "contact us" not in text


def test_navigation_and_scripts_are_stripped() -> None:
    html = """<html><body>
        <nav><a href="/x">Join Our Team</a></nav>
        <script>var a = 1;</script><style>p{color:red}</style>
        <div class="wsite-not-footer"><p>Real content here.</p></div>
        </body></html>"""
    soup = BeautifulSoup(html, "lxml")

    _strip_boilerplate(soup)
    text = soup.get_text()

    assert "Real content here." in text
    assert "Join Our Team" not in text
    assert "var a" not in text


# ------------------------------------------------------------------- output


def page(url: str, text: str, digest: str) -> ScrapedPage:
    return ScrapedPage(
        url=url, title="T", text=text, fetched_at="2026-07-29T00:00:00+00:00", content_hash=digest
    )


def test_jsonl_is_one_record_per_page(tmp_settings) -> None:
    report = CrawlReport(pages=[page("https://www.scaspa.com/a.html", "alpha", "h1")])

    path = write_jsonl(report, tmp_settings, today="2026-07-29")
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]

    assert path.name == "scaspa_2026-07-29.jsonl"
    assert len(records) == 1
    assert records[0]["source_kind"] == "website"


def test_flagged_report_names_what_the_client_must_supply(tmp_settings) -> None:
    report = CrawlReport(
        flagged=[
            FlaggedItem(
                "https://www.scaspa.com/index.html", "javascript_zero_stat", "Tonnes of Cargo"
            ),
            FlaggedItem("https://www.scaspa.com/contact.html", "obfuscated_email", "1 address(es)"),
        ]
    )

    text = write_flagged_report(report, tmp_settings, today="2026-07-29").read_text()

    assert "Tonnes of Cargo" in text
    assert "Needed from SCASPA" in text
    assert "not stored" in text.lower()


# ---------------------------------------------------------------- freshness


def test_diff_reports_added_changed_and_removed(tmp_settings) -> None:
    previous = {
        "https://www.scaspa.com/advisory.html": {
            "hash": "old",
            "title": "Advisory",
            "excerpt": "Old text",
        },
        "https://www.scaspa.com/gone.html": {"hash": "x", "title": "Gone", "excerpt": ""},
    }
    report = CrawlReport(
        pages=[
            page("https://www.scaspa.com/advisory.html", "New advisory text", "new"),
            page("https://www.scaspa.com/press.html", "Brand new page", "n2"),
        ]
    )

    text = diff_report(previous, report, tmp_settings, today="2026-07-29").read_text()

    assert "**1** added" in text
    assert "**1** removed" in text
    assert "**1** changed" in text
    assert "New advisory text" in text
    assert "Old text" in text, "the reader needs to see what it was"


def test_unchanged_pages_are_not_reported_as_changed(tmp_settings) -> None:
    previous = {"https://www.scaspa.com/a.html": {"hash": "same", "title": "A", "excerpt": "x"}}
    report = CrawlReport(pages=[page("https://www.scaspa.com/a.html", "x", "same")])

    text = diff_report(previous, report, tmp_settings, today="2026-07-29").read_text()

    assert "No changes since the last crawl." in text


# ------------------------------------------------------------- web ingestion


def test_web_ingest_rejects_a_leaked_email_placeholder() -> None:
    """Belt and braces behind the scraper's own quarantine."""
    from langchain_core.documents import Document

    from app.rag.web_ingest import assert_no_quarantined_content

    with pytest.raises(ValueError, match="email placeholder"):
        assert_no_quarantined_content(
            [Document(page_content="Contact us at [email protected] today", metadata={})]
        )


def test_web_ingest_allows_the_replacement_token() -> None:
    from langchain_core.documents import Document

    from app.rag.web_ingest import assert_no_quarantined_content

    assert_no_quarantined_content(
        [Document(page_content=f"Email: {EMAIL_PLACEHOLDER}", metadata={})]
    )


def test_pdf_chunks_carry_page_and_source_type(tmp_path) -> None:
    from app.scraper.pdfs import PdfDocument, chunk_pdf

    document = PdfDocument(
        url="https://www.scaspa.com/uploads/port-act.pdf",
        path=tmp_path / "port-act.pdf",
        content_hash="abc",
        fetched_at="2026-07-29T00:00:00+00:00",
        pages=["Section 1. " + ("text " * 300), "Section 2. " + ("more " * 300)],
        title="Port Act",
    )

    chunks = chunk_pdf(document)

    assert chunks
    assert {c.metadata["source_type"] for c in chunks} == {"official-pdf"}
    assert {c.metadata["source_kind"] for c in chunks} == {"website"}
    assert "1" in {c.metadata["page"] for c in chunks}
    assert "2" in {c.metadata["page"] for c in chunks}


def test_settings_blocklist_default_contains_the_payment_portal() -> None:
    assert "pay.scaspa.com" in Settings(_env_file=None).scraper_blocklist_set
