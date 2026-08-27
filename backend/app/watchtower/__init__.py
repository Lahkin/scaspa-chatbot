"""Watchtower — the SCASPA source monitor.

Knowledge freshness, kept deliberately apart from conversation. See
`monitor.py` for the pipeline and `registry.py` for what it is allowed to
fetch.
"""

from app.watchtower.monitor import CheckResult, check_all, check_source, content_hash, normalise
from app.watchtower.registry import SOURCES, Source, by_id

__all__ = [
    "SOURCES",
    "CheckResult",
    "Source",
    "by_id",
    "check_all",
    "check_source",
    "content_hash",
    "normalise",
]
