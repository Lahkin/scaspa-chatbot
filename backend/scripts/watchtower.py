"""Run the SCASPA source monitor once, from a terminal.

    uv run python scripts/watchtower.py            # check whatever is due
    uv run python scripts/watchtower.py --force    # check everything now
    uv run python scripts/watchtower.py --status   # report, fetch nothing

## Why this exists when the application already schedules it

Three jobs the in-process scheduler cannot do:

**Populating a fresh deployment.** A new container starts with an empty store,
waits a minute, then sweeps — so for the first minute the Vessels page correctly
says the schedule has not been retrieved. Running this before opening the port
means the first visitor sees a schedule.

**Answering "is it actually working".** `--status` prints when each source was
last checked, when it last *changed* (not the same fact), and who holds the
sweep lease, without fetching anything.

**Being the whole mechanism if the scheduler is switched off.** Set
`WATCHTOWER_ENABLED=false` and put this in cron; nothing else has to change.
The lease is shared, so a cron run and a running application will not sweep on
top of each other.

`--force` overrides each source's `interval_hours`, which is the one thing to be
careful with: it is for a deployment or a person investigating, not for a loop.
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.watchtower import store  # noqa: E402
from app.watchtower.monitor import check_all  # noqa: E402
from app.watchtower.registry import SOURCES  # noqa: E402


def report(settings) -> int:  # noqa: ANN001
    """What the store knows, without asking SCASPA anything."""
    print(f"database: {store.database_path(settings)}")

    lease = store.scheduler_lease(settings=settings)
    print(f"lease:    {lease['owner']} until {lease['expires_at']}" if lease else "lease:    none")
    print()

    for source in SOURCES:
        state = store.source_state(source.id, settings) or {}
        rows = store.read_cruise_calls(limit=1, settings=settings)[1]
        print(f"{source.id}")
        print(f"  page          {source.page_url or source.url}")
        print(f"  every         {source.interval_hours}h")
        print(f"  status        {state.get('status', 'never checked')}")
        # Two different facts that render identically if you print only one:
        # "the schedule has not moved since Tuesday" and "nobody has looked
        # since Tuesday".
        print(f"  last checked  {state.get('last_checked_at') or 'never'}")
        print(f"  last changed  {state.get('last_changed_at') or 'never'}")
        print(f"  rows stored   {rows}")

    print()
    for entry in store.change_log(limit=5, settings=settings):
        print(
            f"  {entry['checked_at']}  {entry['source_id']:<16} {entry['outcome']:<14}"
            f" rows={entry['rows_parsed']}  {entry['detail'] or ''}".rstrip()
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the SCASPA source monitor once.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="check every source now, ignoring its interval",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="report what the store knows and exit without fetching",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(name)s: %(message)s")
    settings = get_settings()

    if args.status:
        return report(settings)

    results = check_all(force=args.force, settings=settings)
    for result in results:
        rows = "" if result.rows is None else f" rows={result.rows}"
        detail = f"  {result.detail}" if result.detail else ""
        print(f"{result.source_id:<16} {result.outcome:<14}{rows}{detail}")

    # Non-zero when a source actually failed, so cron and a deployment step can
    # tell "nothing was due" from "the fetch broke". `skipped` and `unchanged`
    # are both successful outcomes.
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
