"""Text to speech, with the sanitisation that makes it listenable.

Voice is accessibility, not novelty. Someone standing on the pier with a bag in
one hand needs to *hear* a usable answer, and the difference between usable and
useless is almost entirely in what happens before synthesis.

## What sanitisation has to fix

The answer text is written to be read on a screen and carries things that are
actively hostile when spoken:

* **Markdown.** "asterisk asterisk Port Zante asterisk asterisk" is nonsense.
* **Citation markers.** `[kb-008]` becomes "bracket kay bee dash zero zero
  eight" — meaningless aloud, and the citations are shown on screen anyway.
* **Phone numbers.** This is the one that matters most. `869-465-8121` read as a
  number is "eight hundred sixty-nine million, four hundred sixty-five
  thousand…". Nobody can write that down. It has to be spoken as digit groups.
  SCASPA publishes theirs as `869-465-8121 / 2 / 3`, meaning three consecutive
  numbers, so that exact shape is expanded properly — it is the single most
  spoken string in the product, since it ends every refusal.
* **URLs.** Read aloud, `https://www.scaspa.com/port-act.html` is a minute of
  "aitch tee tee pee ess colon slash slash".
* **Currency codes.** "XCD 44.44" as "ex see dee" helps nobody.

## Caching

Synthesis is billed per character and the canned messages — the refusal, the
no-answer, the greeting — are identical every time. They are cached on disk by
SHA-256 of the *sanitised* text, with an LRU cap. During a rehearsal the same
answers are spoken over and over; this makes that free after the first time.

Cached audio is the **only** thing this module writes to disk. Uploaded audio
never touches it.
"""

import hashlib
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings, get_settings
from app.upstream import call_with_retry
from app.voice.provider import elevenlabs_synthesise, resolve_provider

logger = logging.getLogger(__name__)

MAX_TTS_CHARS = 4000
CACHE_MAX_ENTRIES = 200

# --------------------------------------------------------------- sanitisation

_CITATION = re.compile(r"\[kb-\d{3,4}\]")
_CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE = re.compile(r"`([^`]*)`")
_MD_LINK = re.compile(r"\[([^\]]+)\]\((?:[^)]*)\)")
_MD_IMAGE = re.compile(r"!\[([^\]]*)\]\((?:[^)]*)\)")
_MD_EMPHASIS = re.compile(r"(\*{1,3}|_{1,3})(\S.*?\S|\S)\1")
_MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.MULTILINE)
_MD_BULLET = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_MD_QUOTE = re.compile(r"^\s*>\s?", re.MULTILINE)
_MD_RULE = re.compile(r"^\s*([-*_])\s*(?:\1\s*){2,}$", re.MULTILINE)
_TABLE_ROW = re.compile(r"^\s*\|(.*)\|\s*$", re.MULTILINE)
_TABLE_SEPARATOR = re.compile(r"^\s*\|[\s:|-]+\|\s*$", re.MULTILINE)


def _speak_table_row(match: re.Match) -> str:
    """`| Berth | EC$100 |` -> `Berth, EC$100.` — cells read, pipes dropped."""
    cells = [cell.strip() for cell in match.group(1).split("|") if cell.strip()]
    return (", ".join(cells) + ".") if cells else " "


# A whole JSON object or array on its own. Answers should never contain one, but
# a malfunctioning model can emit one and it is unbearable spoken.
_JSON_BLOB = re.compile(r"(?<!\w)([{\[])\s*\"[^\"]+\"\s*:.*?([}\]])", re.DOTALL)

_URL = re.compile(r"https?://\S+|\bwww\.\S+")

# SCASPA's published number: 869-465-8121 / 2 / 3 — three consecutive lines.
_SCASPA_MULTI = re.compile(r"\b(\d{3})[-.\s](\d{3})[-.\s](\d{4})((?:\s*/\s*\d)+)")
_PHONE = re.compile(r"(?<!\d)(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?!\d)")

# ── A LOCAL NUMBER, WITH THE AREA CODE STATED ONCE ──────────────────────────
#
# `kb-005` reads: "(869) 465-8121, 465-8122, 465-8123, or 465-8124". Only the
# first of those matches `_PHONE`, because the rest are seven digits with the
# area code left implicit — so the smoke check produced
#
#     8 6 9, 4 6 5, 8 1 2 1, 465-8122, 465-8123, or 465-8124
#
# and a listener would have heard "four hundred sixty-five dash eight thousand
# one hundred twenty-two" for three of the four lines. That is the exact failure
# the whole sanitiser exists to prevent, on the answer people ring about.
#
# Applied ONLY when a full number was already expanded in the same text — see
# `sanitise_for_speech`. `\d{3}-\d{4}` on its own would also match a range like
# "berths 100-2000", and turning that into digits is a small degradation where
# missing a phone number is a real failure. Requiring a phone in context keeps
# the aggressive reading where it belongs.
_LOCAL_PHONE = re.compile(r"(?<![\d-])(\d{3})-(\d{4})(?![\d-])")

_CURRENCY_SUFFIX = {
    "XCD": " East Caribbean dollars",
    "EC$": " East Caribbean dollars",
    "US$": " US dollars",
    "USD": " US dollars",
}


def _speak_digits(digits: str) -> str:
    """`8121` -> `8 1 2 1`, so a voice model reads digits, not a quantity."""
    return " ".join(digits)


def _expand_phone(match: re.Match) -> str:
    area, exchange, line = match.group(1), match.group(2), match.group(3)
    return f"{_speak_digits(area)}, {_speak_digits(exchange)}, {_speak_digits(line)}"


def _expand_local_phone(match: re.Match) -> str:
    """`465-8122` -> `4 6 5, 8 1 2 2`, the area code already having been said."""
    return f"{_speak_digits(match.group(1))}, {_speak_digits(match.group(2))}"


def _expand_scaspa_multi(match: re.Match) -> str:
    """Expand `869-465-8121 / 2 / 3` into three speakable numbers.

    The trailing `/ 2 / 3` means the last digit varies — three separate lines,
    not one number followed by stray digits. Spoken naively it becomes
    "…eight one two one slash two slash three", which sounds like noise.
    """
    area, exchange, line, alternates = match.groups()
    base = f"{_speak_digits(area)}, {_speak_digits(exchange)}, {_speak_digits(line)}"
    extras = re.findall(r"\d", alternates)
    if not extras:
        return base
    stem = line[:-1]
    spoken_extras = [
        f"{_speak_digits(area)}, {_speak_digits(exchange)}, {_speak_digits(stem + digit)}"
        for digit in extras
    ]
    return base + ", or " + ", or ".join(spoken_extras)


def _expand_currency(text: str) -> str:
    """`XCD 44.44` -> `44.44 East Caribbean dollars`."""
    for code, suffix in _CURRENCY_SUFFIX.items():
        pattern = re.compile(rf"{re.escape(code)}\s?(\d[\d,]*(?:\.\d{{1,2}})?)", re.IGNORECASE)
        text = pattern.sub(lambda m, s=suffix: f"{m.group(1)}{s}", text)
    return text


def sanitise_for_speech(text: str) -> str:
    """Turn on-screen answer text into something worth hearing.

    Order matters: citations and code fences go before markdown emphasis, so a
    marker inside a code span cannot survive; phone expansion runs after URL
    removal so a number inside a link is not mangled twice.
    """
    if not text:
        return ""

    # Structure that should not be spoken at all.
    text = _CODE_FENCE.sub(" ", text)
    text = _JSON_BLOB.sub(" ", text)
    text = _MD_RULE.sub(" ", text)

    # Tables: read the cells, drop the pipes. Deleting the whole row lost the
    # content — an answer that was only a fee table synthesised to silence, and
    # then failed as "nothing to speak".
    text = _TABLE_SEPARATOR.sub(" ", text)
    text = _TABLE_ROW.sub(_speak_table_row, text)

    # Citation markers — shown on screen, never spoken.
    text = _CITATION.sub("", text)

    # Markdown inline syntax, keeping the words.
    text = _MD_IMAGE.sub(r"\1", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _INLINE_CODE.sub(r"\1", text)
    text = _MD_EMPHASIS.sub(r"\2", text)
    text = _MD_HEADING.sub("", text)
    text = _MD_BULLET.sub("", text)
    text = _MD_QUOTE.sub("", text)

    # URLs are unlistenable.
    text = _URL.sub("the SCASPA website", text)

    # Numbers a listener needs to be able to write down.
    text, multi = _SCASPA_MULTI.subn(_expand_scaspa_multi, text)
    text, full = _PHONE.subn(_expand_phone, text)
    if multi or full:
        # Only now. A bare `465-8122` is a telephone number BECAUSE a full one
        # was stated beside it; the same digits in a sentence about berth
        # numbers are not. See the note on `_LOCAL_PHONE`.
        text = _LOCAL_PHONE.sub(_expand_local_phone, text)
    text = _expand_currency(text)

    # Any stray emphasis characters left over.
    text = re.sub(r"[*_`#]+", " ", text)

    # Join lines into sentences. A bare space ran "…8 1 2 3" straight into
    # "Post:", which a listener hears as one breathless clause; a full stop
    # gives the voice model somewhere to pause.
    lines = [" ".join(line.split()) for line in text.splitlines()]
    joined = ""
    for line in (ln for ln in lines if ln):
        if joined and not joined.endswith((".", "!", "?", ":", ",", ";")):
            joined += "."
        joined += (" " if joined else "") + line
    text = joined

    # Removing a citation marker leaves a space before the punctuation that
    # followed it — "for an adult ticket ." reads as an odd pause.
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)

    return " ".join(text.split()).strip()


# --------------------------------------------------------------------- cache


@dataclass
class CacheEntry:
    path: Path
    digest: str
    hit: bool


def cache_dir(settings: Settings | None = None) -> Path:
    """Where synthesised audio is cached. The only audio ever written to disk."""
    settings = settings or get_settings()
    path = settings.scraped_path.parent / "tts_cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def text_digest(sanitised: str, settings: Settings | None = None) -> str:
    """Cache key: SHA-256 of the sanitised text plus the voice and model.

    The voice and model are part of the key, so changing either does not serve
    stale audio in the wrong voice.
    """
    settings = settings or get_settings()
    material = f"{settings.OPENAI_TTS_MODEL}|{settings.OPENAI_TTS_VOICE}|{sanitised}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def prune_cache(settings: Settings | None = None, max_entries: int = CACHE_MAX_ENTRIES) -> int:
    """Evict least-recently-used entries. Returns how many were removed."""
    directory = cache_dir(settings)
    files = sorted(directory.glob("*.mp3"), key=lambda p: p.stat().st_atime, reverse=True)
    removed = 0
    for path in files[max_entries:]:
        try:
            path.unlink()
            removed += 1
        except OSError:
            logger.debug("cache_evict_failed path=%s", path, exc_info=True)
    if removed:
        logger.info("tts_cache_evicted count=%d", removed)
    return removed


# ----------------------------------------------------------------- synthesis


class TTSUnavailableError(RuntimeError):
    """Synthesis failed. Voice is an enhancement; the text path is unaffected."""


def build_speech_client(settings: Settings | None = None):  # noqa: ANN201
    from openai import OpenAI

    settings = settings or get_settings()
    return OpenAI(api_key=settings.OPENAI_API_KEY or None, timeout=settings.OPENAI_TIMEOUT_SECONDS)


def synthesise(
    text: str,
    settings: Settings | None = None,
    client=None,  # noqa: ANN001
    use_cache: bool = True,
) -> tuple[bytes, CacheEntry]:
    """Sanitise, synthesise and cache. Returns `(mp3_bytes, cache_entry)`.

    Raises `ValueError` if the text is empty or too long, and
    `TTSUnavailableError` if the provider fails.
    """
    settings = settings or get_settings()
    sanitised = sanitise_for_speech(text)

    if not sanitised:
        raise ValueError("nothing to speak once markdown and citations were removed")
    if len(sanitised) > MAX_TTS_CHARS:
        raise ValueError(f"text is {len(sanitised)} characters; the limit is {MAX_TTS_CHARS}")

    digest = text_digest(sanitised, settings)
    path = cache_dir(settings) / f"{digest}.mp3"

    if use_cache and path.exists():
        # Touch so LRU eviction sees this as recently used.
        path.touch()
        logger.info("tts_cache_hit digest=%s bytes=%d", digest[:12], path.stat().st_size)
        return path.read_bytes(), CacheEntry(path=path, digest=digest, hit=True)

    started = time.perf_counter()
    provider = resolve_provider(settings)
    try:
        if provider == "elevenlabs":
            # `client` is the OpenAI injection point used by the tests; the
            # ElevenLabs path builds its own per call, because an httpx client
            # is cheap and holding one open across a process adds a connection
            # to manage for no benefit at this request rate.
            audio = call_with_retry(
                lambda: elevenlabs_synthesise(sanitised, settings), settings=settings
            )
        else:
            speech = client or build_speech_client(settings)
            response = call_with_retry(
                lambda: speech.audio.speech.create(
                    model=settings.OPENAI_TTS_MODEL,
                    voice=settings.OPENAI_TTS_VOICE,
                    input=sanitised,
                    response_format="mp3",
                ),
                settings=settings,
            )
            audio = response.content if hasattr(response, "content") else bytes(response)
    except ValueError:
        # A configuration fault — no voice chosen — not a provider failure. It
        # travels as ValueError, which the router already renders as a rejected
        # request rather than as "the provider is down".
        raise
    except Exception as exc:
        logger.warning("tts_failed provider=%s error=%s", provider, type(exc).__name__)
        raise TTSUnavailableError(str(exc)) from exc

    elapsed = int((time.perf_counter() - started) * 1000)
    # Characters and latency are logged; the text itself is not, and no
    # identifier ever is — CLAUDE.md rule 9.
    logger.info(
        "tts_synthesised provider=%s chars=%d bytes=%d latency_ms=%d",
        provider,
        len(sanitised),
        len(audio),
        elapsed,
    )

    if use_cache:
        path.write_bytes(audio)
        prune_cache(settings)

    return audio, CacheEntry(path=path, digest=digest, hit=False)
