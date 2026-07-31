"""Operational data: vessel movements, flight movements and the tariff table.

## The separation this package exists to keep

The assistant cannot see live operations and says so — `app/agent/prompts.py`
rule 10 forbids it from claiming a berth is occupied or a flight is delayed, and
forbids inferring either from a published schedule. That rule is not softened
anywhere.

This package is the other half of the answer. It is a **plain data path with no
model in it**: a feed comes in, it is validated, and it goes out with a
`DataSource` saying where it came from and when. A UI panel may therefore show
"EN ROUTE" — because a named feed said so at a stated time — while the assistant
still declines to say it in a sentence, because the assistant has no feed.

## Sources

`OPS_DATA_SOURCE` selects one:

* `none` — nothing is configured. Every endpoint answers 200 with an empty list
  and `kind="unavailable"`, which the UI renders as its empty state. This is the
  default, and it is the only correct default: the alternative is a console that
  invents a port.
* `fixture` — the obviously-fake sample feed in `app/ops/fixtures.py`, for
  development and for exercising the UI. **Refused at boot when `ENV=prod`**;
  see `app/main.py`.

A real feed (AIS, an airport AODB, a published tariff export) is a third source
implementing `OpsSource`, and nothing above it needs to change.
"""

from app.ops.source import (
    FixtureOpsSource,
    OpsSource,
    UnavailableOpsSource,
    get_ops_source,
    reset_ops_source,
)

__all__ = [
    "FixtureOpsSource",
    "OpsSource",
    "UnavailableOpsSource",
    "get_ops_source",
    "reset_ops_source",
]
