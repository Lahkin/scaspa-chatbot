"""Deliberate, run-on-demand crawler for scaspa.com.

**Never call this from a request handler.** It is slow, it depends on a third
party, and it will pick the worst possible moment to fail. It is a script you
run, look at the output of, and then ingest.

## The blocklist is a hard failure, not a filter

`pay.scaspa.com` is a live payment portal. A URL matching `SCRAPER_BLOCKLIST`
raises `BlockedURLError` — it is never quietly skipped. A skip is a decision the
code makes silently; an exception is a decision a human has to look at. This is
CLAUDE.md rule 3 and it is asserted in `tests/test_scraper.py`.

## Three traps this site sets

Each was confirmed against the live site on 2026-07-29, not assumed:

1. **The homepage statistics are JavaScript counters.** "Annual Statistics Based
   on 2025" renders four literal `0` values — Vessel Calls, Flights, Cruise
   Passengers, Tonnes of Cargo — that animate upward only in a browser. A plain
   fetch stores zero. An assistant telling anyone SCASPA handled zero cruise
   passengers would be a catastrophe, so a numeric stat that parses to zero is
   **quarantined into `flagged_for_client.md` and never stored**.
2. **Emails are Cloudflare-obfuscated** (`data-cfemail`). The address is not
   reconstructed and the placeholder is not stored; both are replaced with
   `[EMAIL — CONFIRM WITH CLIENT]` and the page is flagged.
3. **The real content is in PDFs.** The Port Act and eight audited financial
   statements are PDFs. PDF links are collected here and handled in
   `app/scraper/pdfs.py`.

## robots.txt

Fetched first and honoured. The site publishes a sitemap, which is preferred —
but the sitemap **also lists robots-disallowed URLs** (`ferry-admin.html`,
`cruise-admin-old.html`, `cargo-security-testing.html`), so every sitemap entry
is still filtered through robots. Preferring the sitemap without that filter
would crawl pages the site asked us not to.

If robots disallows a page the project actually needs, the crawl stops and says
so. That is a conversation with the client, not something to route around.
"""

import hashlib
import json
import logging
import random
import re
import time
import urllib.robotparser
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

SITE_ROOT = "https://www.scaspa.com"
ALLOWED_HOSTS = frozenset({"scaspa.com", "www.scaspa.com"})

# Open question 17 in the handbook: is portzante.com in scope? Until the client
# says yes it is not crawled, because it is a separate operator's site and we
# would be republishing their content as SCASPA's.
INCLUDE_PORT_ZANTE_DEFAULT = False
PORT_ZANTE_HOSTS = frozenset({"portzante.com", "www.portzante.com"})

EMAIL_PLACEHOLDER = "[EMAIL — CONFIRM WITH CLIENT]"
STAT_PLACEHOLDER = "[FIGURE UNAVAILABLE — CONFIRM WITH CLIENT]"

# Roughly one request per second, with jitter so we are not a metronome.
REQUEST_DELAY_SECONDS = 1.0
REQUEST_JITTER_SECONDS = 0.4

REQUEST_TIMEOUT_SECONDS = 30.0

# Pages the project needs. If robots disallows one of these the crawl stops.
REQUIRED_PATHS = (
    "/index.html",
    "/our-history.html",
    "/company-profile.html",
    "/management-team.html",
    "/seaports.html",
    "/port-pilotage--berthing-information.html",
    "/airport.html",
    "/port-act.html",
    "/audited-financial-statements.html",
    "/seaport-tariffs.html",
    "/press-releases.html",
    "/travel-advisory.html",
    "/accolades.html",
    "/contact.html",
    "/join-our-team.html",
    "/cargo.html",
    "/flights-airport.html",
    "/cruise-ship-schedule.html",
    "/ferry-schedule.html",
)

# Boilerplate containers to drop before extracting text.
_STRIP_TAGS = ("script", "style", "nav", "header", "footer", "form", "noscript", "svg")
_BOILERPLATE_WORDS = frozenset(
    {"nav", "navigation", "menu", "footer", "header", "banner", "social", "cookie", "breadcrumb"}
)
# Never decompose these, whatever class they carry — the body tag on this site
# has class="header-page", which would delete the entire document.
_PROTECTED_TAGS = frozenset({"html", "body", "main", "article"})


class BlockedURLError(RuntimeError):
    """A URL matched SCRAPER_BLOCKLIST. Never downgrade this to a skip."""


class RobotsDisallowedError(RuntimeError):
    """robots.txt disallows a page the project needs. Talk to the client."""


@dataclass
class FlaggedItem:
    """Something a human must resolve before it can be used."""

    url: str
    kind: str
    label: str
    detail: str = ""


@dataclass
class ScrapedPage:
    """One fetched page."""

    url: str
    title: str
    text: str
    fetched_at: str
    content_hash: str

    def to_json(self) -> dict:
        return {
            "url": self.url,
            "title": self.title,
            "text": self.text,
            "fetched_at": self.fetched_at,
            "content_hash": self.content_hash,
            "source_kind": "website",
        }


@dataclass
class CrawlReport:
    """Outcome of one crawl."""

    pages: list[ScrapedPage] = field(default_factory=list)
    flagged: list[FlaggedItem] = field(default_factory=list)
    pdf_urls: list[str] = field(default_factory=list)
    skipped_by_robots: list[str] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""

    def summary(self) -> str:
        lines = [
            "=" * 66,
            "Crawl summary",
            "=" * 66,
            f"  pages fetched      : {len(self.pages)}",
            f"  PDFs found         : {len(self.pdf_urls)}",
            f"  flagged for client : {len(self.flagged)}",
            f"  skipped by robots  : {len(self.skipped_by_robots)}",
            f"  errors             : {len(self.errors)}",
        ]
        if self.flagged:
            lines.append("")
            lines.append("  Flagged (never indexed):")
            counts: dict[str, int] = {}
            for item in self.flagged:
                counts[item.kind] = counts.get(item.kind, 0) + 1
            lines.extend(f"    {kind:<28} {count:>4}" for kind, count in sorted(counts.items()))
        if self.errors:
            lines.append("")
            lines.append("  Errors:")
            lines.extend(f"    {url}: {reason}" for url, reason in self.errors)
        lines.append("=" * 66)
        return "\n".join(lines)


# ---------------------------------------------------------------- blocklist


def is_blocked(url: str, settings: Settings | None = None) -> bool:
    """Whether a URL matches the blocklist."""
    settings = settings or get_settings()
    host = (urlparse(url).hostname or "").lower()
    target = f"{host}{urlparse(url).path}".lower()
    for entry in settings.scraper_blocklist_set:
        if host == entry or host.endswith(f".{entry}") or entry in target:
            return True
    return False


def assert_not_blocked(url: str, settings: Settings | None = None) -> None:
    """Raise if the URL is blocklisted.

    Deliberately an exception. `pay.scaspa.com` is a live payment portal; a
    silent skip would let a future refactor quietly start fetching it.
    """
    if is_blocked(url, settings):
        raise BlockedURLError(
            f"Refusing to fetch {url}: it matches SCRAPER_BLOCKLIST. "
            "pay.scaspa.com is a live payment portal and must never be fetched, "
            "tested against, or linked to (CLAUDE.md rule 3)."
        )


def is_in_scope(url: str, include_port_zante: bool = INCLUDE_PORT_ZANTE_DEFAULT) -> bool:
    """Whether a URL is one we are willing to crawl at all."""
    host = (urlparse(url).hostname or "").lower()
    if host in ALLOWED_HOSTS:
        return True
    return bool(include_port_zante and host in PORT_ZANTE_HOSTS)


# ------------------------------------------------------------- the crawler


class Crawler:
    """Polite, robots-respecting crawler for one site."""

    def __init__(
        self,
        settings: Settings | None = None,
        client: httpx.Client | None = None,
        include_port_zante: bool = INCLUDE_PORT_ZANTE_DEFAULT,
        delay: float = REQUEST_DELAY_SECONDS,
        sleep=time.sleep,  # noqa: ANN001 — injected so tests do not wait
    ) -> None:
        self.settings = settings or get_settings()
        self.include_port_zante = include_port_zante
        self.delay = delay
        self._sleep = sleep
        self._owns_client = client is None
        self.client = client or httpx.Client(
            headers={"User-Agent": self.settings.SCRAPER_USER_AGENT},
            timeout=REQUEST_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
        self.robots: urllib.robotparser.RobotFileParser | None = None
        self._last_request = 0.0

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def __enter__(self) -> "Crawler":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- politeness ------------------------------------------------------

    def _wait(self) -> None:
        """Roughly one request per second, jittered."""
        elapsed = time.monotonic() - self._last_request
        pause = self.delay + random.uniform(0, REQUEST_JITTER_SECONDS)  # noqa: S311
        if elapsed < pause:
            self._sleep(pause - elapsed)
        self._last_request = time.monotonic()

    def fetch(self, url: str) -> httpx.Response:
        """Fetch one URL, after the blocklist and scope checks."""
        assert_not_blocked(url, self.settings)
        if not is_in_scope(url, self.include_port_zante):
            raise ValueError(f"out of scope: {url}")
        self._wait()
        logger.info("fetch url=%s", url)
        response = self.client.get(url)
        response.raise_for_status()
        return response

    # -- robots ----------------------------------------------------------

    def load_robots(self) -> urllib.robotparser.RobotFileParser:
        """Fetch and parse robots.txt. The crawler's first act."""
        url = f"{SITE_ROOT}/robots.txt"
        assert_not_blocked(url, self.settings)
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(url)
        self._wait()
        response = self.client.get(url)
        if response.status_code == 200:
            parser.parse(response.text.splitlines())
        else:
            # No robots.txt means no restrictions, but say so out loud.
            logger.warning(
                "robots_missing status=%d — proceeding with defaults", response.status_code
            )
            parser.parse([])
        self.robots = parser
        return parser

    def may_fetch(self, url: str) -> bool:
        """Whether robots.txt allows this URL for our user agent."""
        if self.robots is None:
            raise RuntimeError("load_robots() must run before may_fetch()")
        return self.robots.can_fetch(self.settings.SCRAPER_USER_AGENT, url)

    def check_required_paths(self) -> list[str]:
        """Required pages robots disallows. Empty is the happy path."""
        return [p for p in REQUIRED_PATHS if not self.may_fetch(f"{SITE_ROOT}{p}")]

    # -- discovery -------------------------------------------------------

    def sitemap_urls(self) -> list[str]:
        """URLs from sitemap.xml, or [] if there is none."""
        sitemap = getattr(self.robots, "site_maps", lambda: None)() or [f"{SITE_ROOT}/sitemap.xml"]
        found: list[str] = []
        for sitemap_url in sitemap:
            try:
                response = self.fetch(sitemap_url)
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("sitemap_failed url=%s error=%s", sitemap_url, exc)
                continue
            found.extend(re.findall(r"<loc>\s*(.*?)\s*</loc>", response.text, re.IGNORECASE))
        return found

    def discover(self) -> tuple[list[str], list[str]]:
        """Work out what to crawl. Returns (allowed, skipped_by_robots).

        Sitemap first, then the required paths as a safety net. Every candidate
        is filtered through robots — the sitemap lists disallowed URLs, so
        trusting it blindly would crawl pages the site asked us not to.
        """
        candidates: list[str] = []
        seen: set[str] = set()

        for url in [*self.sitemap_urls(), *(f"{SITE_ROOT}{p}" for p in REQUIRED_PATHS)]:
            normalised = url.split("#")[0].rstrip("/")
            if normalised in seen or not is_in_scope(normalised, self.include_port_zante):
                continue
            if is_blocked(normalised, self.settings):
                # Not an exception here: robots.txt itself lists a payment URL,
                # and refusing to even consider it is the correct behaviour.
                logger.warning("blocklisted_url_skipped_from_discovery url=%s", normalised)
                continue
            seen.add(normalised)
            candidates.append(normalised)

        allowed = [u for u in candidates if self.may_fetch(u)]
        skipped = [u for u in candidates if not self.may_fetch(u)]
        return allowed, skipped

    # -- extraction ------------------------------------------------------

    def parse(self, url: str, html: str, report: CrawlReport) -> ScrapedPage:
        """Turn one page's HTML into clean text, quarantining the traps."""
        soup = BeautifulSoup(html, "lxml")

        title = soup.title.get_text(strip=True) if soup.title else ""

        # Trap 2 — before stripping anything, quarantine obfuscated emails.
        emails_found = _quarantine_emails(soup)
        if emails_found:
            report.flagged.append(
                FlaggedItem(
                    url=url,
                    kind="obfuscated_email",
                    label=f"{emails_found} address(es)",
                    detail=(
                        "Cloudflare email protection. Not reconstructed and not stored. "
                        "Obtain the real address from SCASPA and enter it as a "
                        "knowledge-base row with a source and a date."
                    ),
                )
            )

        # Trap 1 — quarantine JavaScript stat counters that fetch as zero.
        for label in _find_zero_stats(soup):
            report.flagged.append(
                FlaggedItem(
                    url=url,
                    kind="javascript_zero_stat",
                    label=label,
                    detail=(
                        "Animated counter; a plain HTTP fetch reads 0. NOT stored. "
                        "Take the real figure from the annual report or from SCASPA "
                        "and enter it as a knowledge-base row with a source and a date."
                    ),
                )
            )

        _strip_boilerplate(soup)

        text = "\n".join(
            line for line in (ln.strip() for ln in soup.get_text("\n").splitlines()) if line
        )
        return ScrapedPage(
            url=url,
            title=title,
            text=text,
            fetched_at=datetime.now(UTC).isoformat(),
            content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        )

    def pdf_links(self, url: str, html: str) -> list[str]:
        """Absolute, in-scope PDF URLs linked from a page."""
        soup = BeautifulSoup(html, "lxml")
        found: list[str] = []
        for anchor in soup.find_all("a", href=True):
            href = urljoin(url, anchor["href"]).split("#")[0]
            if not href.lower().endswith(".pdf"):
                continue
            if is_blocked(href, self.settings) or not is_in_scope(href, self.include_port_zante):
                continue
            found.append(href)
        return found

    # -- the crawl -------------------------------------------------------

    def crawl(self, limit: int | None = None) -> CrawlReport:
        """Run the crawl. Raises `RobotsDisallowedError` if a needed page is barred."""
        report = CrawlReport(started_at=datetime.now(UTC).isoformat())
        self.load_robots()

        barred = self.check_required_paths()
        if barred:
            raise RobotsDisallowedError(
                "robots.txt disallows pages this project needs:\n  "
                + "\n  ".join(barred)
                + "\n\nStopping. This is a conversation with SCASPA about what the "
                "assistant may use, not something to work around."
            )

        allowed, skipped = self.discover()
        report.skipped_by_robots = skipped
        if limit is not None:
            allowed = allowed[:limit]

        logger.info("crawl_start pages=%d skipped_by_robots=%d", len(allowed), len(skipped))

        seen_pdfs: set[str] = set()
        for url in allowed:
            try:
                response = self.fetch(url)
            except (httpx.HTTPError, ValueError) as exc:
                report.errors.append((url, f"{type(exc).__name__}: {exc}"))
                continue

            content_type = response.headers.get("content-type", "")
            if "html" not in content_type.lower():
                continue

            report.pages.append(self.parse(url, response.text, report))
            for pdf in self.pdf_links(url, response.text):
                if pdf not in seen_pdfs:
                    seen_pdfs.add(pdf)
                    report.pdf_urls.append(pdf)

        report.finished_at = datetime.now(UTC).isoformat()
        return report


# ------------------------------------------------------------ trap helpers

_CFEMAIL_SELECTORS = ("[data-cfemail]", "a[href*='/cdn-cgi/l/email-protection']")


def _quarantine_emails(soup: BeautifulSoup) -> int:
    """Replace Cloudflare-obfuscated emails with a token. Returns how many.

    The encoding is trivially reversible, and that is exactly why we do not
    reverse it: SCASPA obfuscated the address deliberately, and a scraped
    address is unverified anyway. The real one comes from the client.
    """
    count = 0
    for selector in _CFEMAIL_SELECTORS:
        for element in soup.select(selector):
            element.replace_with(EMAIL_PLACEHOLDER)
            count += 1
    # Cloudflare also leaves a literal "[email protected]" in the text.
    for node in soup.find_all(string=re.compile(r"\[email\s*protected\]", re.IGNORECASE)):
        node.replace_with(re.sub(r"\[email\s*protected\]", EMAIL_PLACEHOLDER, node, flags=re.I))
        count += 1
    return count


_STAT_LABEL = re.compile(
    r"(vessel|flight|passenger|cargo|tonne|ton|call|movement|visitor|container)", re.IGNORECASE
)


def _find_zero_stats(soup: BeautifulSoup) -> list[str]:
    """Labels of numeric stat blocks that fetched as zero, **removing them**.

    The homepage renders "Annual Statistics Based on 2025" with four counters
    that a browser animates upward and a plain fetch reads as `0`.

    This does not merely detect: it replaces each zero in the tree with
    `STAT_PLACEHOLDER`, so the figure cannot be stored, chunked or indexed by
    any later step. Flagging alone was not enough — on the live homepage the
    zeros survived into the extracted text and only disappeared because that
    block happened to sit inside a container the boilerplate stripper removed.
    Relying on that would be relying on luck, and the failure mode is an
    assistant reporting that SCASPA handled zero cruise passengers.
    """
    labels: list[str] = []
    seen: set[str] = set()

    strings = [s for s in soup.find_all(string=True) if s.strip()]
    texts = [s.strip() for s in strings]

    for index, value in enumerate(texts):
        if not re.fullmatch(r"0+([.,]0+)?", value):
            continue
        # The label FOLLOWS the number on this site ("0", then "Vessel Calls").
        # Checking the preceding value first attached each zero to the previous
        # counter's label, so "Vessel Calls" was reported twice and "Tonnes of
        # Cargo" not at all — a client reading that would not know to chase the
        # cargo figure. The preceding value stays as a fallback in case the
        # layout changes.
        candidates = texts[index + 1 : index + 2] + texts[max(0, index - 1) : index]
        for candidate in candidates:
            if _STAT_LABEL.search(candidate) and len(candidate) < 60:
                if candidate not in seen:
                    seen.add(candidate)
                    labels.append(candidate)
                strings[index].replace_with(STAT_PLACEHOLDER)
                break
    return labels


def _is_boilerplate_value(value: str) -> bool:
    """Whether a class/id names a navigation or chrome container.

    Two traps on this Weebly build, both found by extracting 20 characters from
    a real page and asking why:

    * The main content wrapper is `wsite-elements wsite-not-footer`. A substring
      match on "footer" deletes the entire article — the container is named for
      what it is *not*. Anything containing `not-` is therefore content.
    * The `<body>` tag carries `class="header-page ..."`, so a naive class match
      decomposes the whole document.

    Matching is on whole tokens, never substrings.
    """
    lowered = value.lower()
    if "not-" in lowered or "not_" in lowered:
        return False
    tokens = re.split(r"[\s\-_]+", lowered)
    return any(token in _BOILERPLATE_WORDS for token in tokens)


def _strip_boilerplate(soup: BeautifulSoup) -> None:
    """Remove navigation, footers, scripts and styles before text extraction."""
    for tag in soup.find_all(_STRIP_TAGS):
        tag.decompose()

    total = len(soup.get_text(strip=True)) or 1

    for attribute in ("class", "id"):
        for element in soup.find_all(attrs={attribute: True}):
            if element.name in _PROTECTED_TAGS or element.decomposed:
                continue
            raw = element.get(attribute)
            value = " ".join(raw) if isinstance(raw, list) else str(raw)
            if not _is_boilerplate_value(value):
                continue
            # Last guard: never let a "strip the nav" rule delete the page. If a
            # single element holds most of the text, it is the article.
            if len(element.get_text(strip=True)) > total * 0.5:
                logger.debug("strip_skipped_large_element attr=%s value=%s", attribute, value)
                continue
            element.decompose()


# ------------------------------------------------------------------ output


def scraped_dir(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = settings.scraped_path
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_jsonl(report: CrawlReport, settings: Settings | None = None, today: str = "") -> Path:
    """Write one JSON record per page to a dated file."""
    directory = scraped_dir(settings)
    stamp = today or datetime.now(UTC).date().isoformat()
    path = directory / f"scaspa_{stamp}.jsonl"
    with path.open("w", encoding="utf-8") as handle:
        for page in report.pages:
            handle.write(json.dumps(page.to_json(), ensure_ascii=False) + "\n")
    return path


def write_flagged_report(
    report: CrawlReport, settings: Settings | None = None, today: str = ""
) -> Path:
    """Write `flagged_for_client.md` — everything a human must resolve."""
    directory = scraped_dir(settings)
    stamp = today or datetime.now(UTC).date().isoformat()
    path = directory / "flagged_for_client.md"

    lines = [
        "# Flagged for the client",
        "",
        f"Generated by the scraper on {stamp}.",
        "",
        "Everything here was found on scaspa.com but **deliberately not stored and",
        "never indexed**. Each item needs a real value from SCASPA, entered into the",
        "knowledge-base CSV as a row with a source and an `as_of` date.",
        "",
    ]

    zero_stats = [f for f in report.flagged if f.kind == "javascript_zero_stat"]
    emails = [f for f in report.flagged if f.kind == "obfuscated_email"]

    lines += [
        "## Annual statistics — the homepage counters read as zero",
        "",
        "The figures on the homepage are JavaScript counters that animate upward in a",
        "browser. Fetched over plain HTTP they are literally `0`.",
        "",
        "**These were not stored.** An assistant saying SCASPA handled zero cruise",
        "passengers would be worse than one that says it does not know.",
        "",
    ]
    if zero_stats:
        lines += ["| Label | Page |", "| --- | --- |"]
        lines += [f"| {item.label} | {item.url} |" for item in zero_stats]
        lines += [
            "",
            "**Needed from SCASPA:** the real figure for each, the year it covers, and",
            "the source (annual report page, or a named person). The audited financial",
            "statements at /audited-financial-statements.html are the likely source.",
            "",
        ]
    else:
        lines += ["None found on this crawl.", ""]

    lines += [
        "## Email addresses — obfuscated, not reconstructed",
        "",
        "The site uses Cloudflare email protection. The addresses were **not** decoded",
        f"and the placeholder was not stored; the text now reads `{EMAIL_PLACEHOLDER}`.",
        "",
    ]
    if emails:
        lines += ["| Page | Found |", "| --- | --- |"]
        lines += [f"| {item.url} | {item.label} |" for item in emails]
        lines += [
            "",
            "**Needed from SCASPA:** the public email address(es) to publish, and which",
            "enquiries should go to each.",
            "",
        ]
    else:
        lines += ["None found on this crawl.", ""]

    if report.skipped_by_robots:
        lines += [
            "## Pages robots.txt asked us not to crawl",
            "",
            "Not fetched. Listed so nobody wonders why they are missing.",
            "",
            *[f"- {u}" for u in sorted(report.skipped_by_robots)],
            "",
        ]

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# ------------------------------------------------------------- freshness


def state_path(settings: Settings | None = None) -> Path:
    return scraped_dir(settings) / "crawl_state.json"


def load_state(settings: Settings | None = None) -> dict[str, dict]:
    path = state_path(settings)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def save_state(report: CrawlReport, settings: Settings | None = None) -> Path:
    path = state_path(settings)
    state = {
        page.url: {
            "hash": page.content_hash,
            "title": page.title,
            "fetched_at": page.fetched_at,
            "excerpt": page.text[:400],
        }
        for page in report.pages
    }
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def diff_report(
    previous: dict[str, dict],
    report: CrawlReport,
    settings: Settings | None = None,
    today: str = "",
) -> Path:
    """Write `diff_YYYY-MM-DD.md`: what was added, removed or changed.

    Press releases and travel advisories move. Noticing that SCASPA published a
    new advisory is a much stronger claim than "we scrape the site".
    """
    stamp = today or datetime.now(UTC).date().isoformat()
    path = scraped_dir(settings) / f"diff_{stamp}.md"

    current = {page.url: page for page in report.pages}
    added = sorted(set(current) - set(previous))
    removed = sorted(set(previous) - set(current))
    changed = sorted(
        url
        for url in set(current) & set(previous)
        if current[url].content_hash != previous[url].get("hash")
    )

    lines = [
        f"# Site changes — {stamp}",
        "",
        f"- **{len(added)}** added",
        f"- **{len(removed)}** removed",
        f"- **{len(changed)}** changed",
        "",
    ]

    if not previous:
        lines += ["_First crawl: nothing to compare against._", ""]

    if added:
        lines += ["## Added", ""]
        for url in added:
            page = current[url]
            lines += [f"### {page.title or url}", f"<{url}>", "", f"> {_excerpt(page.text)}", ""]

    if changed:
        lines += ["## Changed", ""]
        for url in changed:
            page = current[url]
            lines += [
                f"### {page.title or url}",
                f"<{url}>",
                "",
                f"**Now:** {_excerpt(page.text)}",
                "",
                f"**Was:** {_excerpt(previous[url].get('excerpt', ''))}",
                "",
            ]

    if removed:
        lines += [
            "## Removed",
            "",
            *[f"- <{url}> ({previous[url].get('title', '')})" for url in removed],
            "",
        ]

    if not (added or removed or changed):
        lines += ["No changes since the last crawl.", ""]

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _excerpt(text: str, limit: int = 240) -> str:
    flat = " ".join(text.split())
    return flat[:limit] + ("…" if len(flat) > limit else "")


def load_pages(path: Path) -> Iterable[dict]:
    """Read a scraped JSONL file back."""
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)
