"""Typed model for one knowledge-base row.

The researchers export a Google Sheet with a fixed header. This module is the
single place that says what a valid row is; everything downstream may assume a
`KBRow` has already passed these checks.

`notes` is internal only. It is never embedded and never surfaced to a user —
see `app.rag.chunking`, which drops it from both text and metadata.
"""

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

# The exact header the researchers export, in order.
CSV_HEADER: tuple[str, ...] = (
    "id",
    "category",
    "subcategory",
    "question",
    "answer",
    "keywords",
    "audience",
    "source_url",
    "source_type",
    "as_of",
    "volatility",
    "confidence",
    "notes",
)

ID_PATTERN = re.compile(r"^kb-\d{3,4}$")

Audience = Literal["traveller", "cruise", "cargo", "business", "all"]
SourceType = Literal["official-site", "official-pdf", "client-interview", "press", "regulator"]
Volatility = Literal["low", "medium", "high"]
Confidence = Literal["confirmed", "probable", "unverified"]

# Only rows at this confidence reach the live assistant — CLAUDE.md rule 8.
INDEXABLE_CONFIDENCE: Confidence = "confirmed"


class KBRow(BaseModel):
    """One validated knowledge-base row.

    `id` is the citation anchor. It is stable and must never be renumbered.
    """

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    id: str
    category: str
    subcategory: str = ""
    question: str
    answer: str
    keywords: str = ""
    audience: Audience
    source_url: str
    source_type: SourceType
    as_of: date
    volatility: Volatility
    confidence: Confidence
    notes: str = ""

    @field_validator("id")
    @classmethod
    def _id_shape(cls, v: str) -> str:
        if not ID_PATTERN.match(v):
            raise ValueError(f"id must match ^kb-\\d{{3,4}}$ (e.g. kb-001), got {v!r}")
        return v

    @field_validator("category", "question", "answer", "source_url")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v

    @property
    def is_indexable(self) -> bool:
        """Whether this row may enter the live index."""
        return self.confidence == INDEXABLE_CONFIDENCE

    @property
    def keyword_list(self) -> list[str]:
        """`keywords` split on its pipe separator, blanks removed."""
        return [k.strip() for k in self.keywords.split("|") if k.strip()]


class RejectedRow(BaseModel):
    """A row that failed validation, with enough detail to fix the spreadsheet.

    Rejections are always reported, never silently dropped.
    """

    row_number: int
    """1-based line number in the CSV as the researcher sees it, header included."""

    row_id: str | None
    """The row's `id` if it was readable, else None."""

    reasons: list[str]
    """One human-readable reason per failed field."""

    def format(self) -> str:
        """Render as a single log line."""
        who = self.row_id or "<no id>"
        return f"line {self.row_number} ({who}): {'; '.join(self.reasons)}"
