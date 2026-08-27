"""The last line of defence: every number in an answer must be in a retrieved row.

CLAUDE.md rule 10 covered money and time. This widens it to **every** class of
figure a traveller would act on — currency, time of day, date, phone number — and
changes the consequence. Previously an unverifiable figure marked the answer
ungrounded and still shipped it. Now the answer is **replaced**.

That is the difference between a warning and a guarantee. A hallucinated tariff or
sailing time is the failure that costs someone money or a sailing, and a
`grounded: false` flag in a JSON field does not stop them reading the number.

## What counts as grounded

A figure is grounded if it appears verbatim in:

* the **text** of a chunk retrieved this turn, or
* a chunk's `as_of` metadata — because the system prompt *requires* schedule
  answers to state the date the information was verified, and that date lives in
  metadata, not in the row text. Without this the correct behaviour would be
  flagged as a hallucination.
* SCASPA's own published contact number, which appears in the escalation block
  rather than in any knowledge-base row.

## Why matching is verbatim

`44` is a substring of `44.44`. A rounded fare, a converted currency or a
reformatted time is exactly the quiet fabrication this catches, and each of those
changes the string. Lookarounds require a complete figure — the same lesson as
`app.agent.tools.figure_in_text`.
"""

import logging
import re
from dataclasses import dataclass, field

from app.agent.prompts import SCASPA_PHONE
from app.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# Citation markers are stripped before scanning: [kb-008] contains digits and
# would otherwise register as an ungrounded figure.
_CITATION = re.compile(r"\[kb-\d{3,4}\]")

CURRENCY = re.compile(
    r"(?:XCD|EC\$|US\$|USD|EC|\$)\s?\d[\d,]*(?:\.\d{1,2})?"
    r"|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:XCD|USD|EC dollars?|dollars?|cents?)\b",
    re.IGNORECASE,
)
TIME_OF_DAY = re.compile(
    r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b"
    r"|\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?)\b",
    re.IGNORECASE,
)
DATE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b"
    r"|\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September"
    r"|October|November|December)\s+\d{1,2}?,?\s*\d{4}\b",
    re.IGNORECASE,
)
PHONE = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")

PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("currency", CURRENCY),
    ("time", TIME_OF_DAY),
    ("date", DATE),
    ("phone", PHONE),
)


@dataclass
class UngroundedFigure:
    """A figure in the answer that no retrieved row supports."""

    kind: str
    value: str


@dataclass
class GroundingResult:
    """Outcome of checking one answer."""

    ungrounded: list[UngroundedFigure] = field(default_factory=list)
    checked: int = 0

    @property
    def ok(self) -> bool:
        return not self.ungrounded

    @property
    def values(self) -> list[str]:
        return [f.value for f in self.ungrounded]


def allowed_text(chunks: list[RetrievedChunk], evidence: list[str] | None = None) -> str:
    """Everything a figure may legitimately have come from.

    Chunk text, plus the metadata a correct answer is *required* to quote: the
    `as_of` verification date (the prompt demands it for every schedule answer)
    and the source URL. Plus SCASPA's own published number, which lives in the
    escalation block rather than in any row.

    `evidence` is text a TOOL produced from a structured official source — the
    published cruise schedule. Those figures are as verifiable as a chunk's,
    and more precisely so: they came out of SCASPA's own table rather than out
    of a sentence about it. They are not citable as kb rows, which is a
    separate question this function does not answer.
    """
    parts: list[str] = [SCASPA_PHONE, *(evidence or [])]
    for chunk in chunks:
        parts.append(chunk.text)
        for key in ("as_of", "source_url", "fetched_at", "page"):
            value = chunk.metadata.get(key)
            if value:
                parts.append(str(value))
    return "\n".join(parts)


def _forms(value: str) -> list[str]:
    """Written variants of the same figure, so a real one is not rejected.

    `12,407,059` and `12407059` are the same number; refusing one because the row
    spells it the other way would suppress correct answers, which is its own
    failure.
    """
    stripped = value.strip()
    forms = {stripped}
    without_commas = stripped.replace(",", "")
    forms.add(without_commas)
    # Normalise currency spacing: "XCD44.44" vs "XCD 44.44".
    forms.add(re.sub(r"(?<=[A-Za-z$])\s+(?=\d)", "", stripped))
    forms.add(re.sub(r"(?<=[A-Za-z$])(?=\d)", " ", stripped))
    # Drop a leading zero on a time: "04:04" vs "4:04".
    if re.match(r"^0\d:", stripped):
        forms.add(stripped[1:])
    return sorted(forms, key=len, reverse=True)


def _appears(value: str, haystack: str) -> bool:
    """Whether `value` occurs as a complete figure, not as a fragment."""
    for form in _forms(value):
        if not form:
            continue
        pattern = re.compile(rf"(?<![\d.,]){re.escape(form)}(?![\d.,]?\d)", re.IGNORECASE)
        if pattern.search(haystack):
            return True
    return False


def check_numbers(
    answer: str, chunks: list[RetrievedChunk], evidence: list[str] | None = None
) -> GroundingResult:
    """Find every figure in `answer` that no retrieved row supports."""
    result = GroundingResult()
    if not answer.strip():
        return result

    scannable = _CITATION.sub(" ", answer)
    haystack = allowed_text(chunks, evidence)
    seen: set[str] = set()

    for kind, pattern in PATTERNS:
        for match in pattern.finditer(scannable):
            value = " ".join(match.group(0).split())
            if value in seen:
                continue
            seen.add(value)
            result.checked += 1
            if not _appears(value, haystack):
                result.ungrounded.append(UngroundedFigure(kind=kind, value=value))

    for figure in result.ungrounded:
        # The value is logged because an operator needs to see what was
        # fabricated. No identifier accompanies it — CLAUDE.md rule 9.
        logger.warning(
            "ungrounded_number kind=%s value=%r retrieved=%s",
            figure.kind,
            figure.value,
            sorted(c.id for c in chunks),
        )

    return result
