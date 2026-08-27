"""What actually makes the six-hour claim true.

## The gap this closes

`check_all()` has existed, tested, since the monitor was written, and **nothing
called it**. The cruise schedule in the store was there because somebody ran it
by hand once. Every "checked 27 Aug at 05:12" on the Vessels page was accurate
about a fetch that was never going to happen again, and would have gone on being
accurate — and steadily more misleading — for as long as the process ran.

That is a worse failure than a missing feature, because the screen keeps making
a confident claim while the thing behind it quietly stops. So this is the piece
that turns `interval_hours=6` from a number in a registry into a fact.

## The loop ticks far more often than any source is due

Every fifteen minutes, and `check_source` decides for itself whether enough time
has passed — `_due()` reads `last_checked_at` and compares against the source's
own `interval_hours`. So a tick on an up-to-date source costs one SQLite read and
nothing else, and a source becomes due within a quarter of an hour of its mark
rather than up to six hours late.

Putting the cadence here instead would mean two places knowing how often the
cruise schedule may be fetched, and they would disagree the first time one of
them changed.

## Nothing is fetched at boot

`STARTUP_DELAY_SECONDS` before the first tick. A process that restarts in a
crash-loop would otherwise hammer SCASPA's endpoint once per restart, and a
deployment that boots six containers would hit it six times in the same second.
It also means a test or a smoke check that starts the app and stops it does no
network I/O at all.

## The blocking work runs on a thread

`check_source` uses a synchronous `httpx.Client` and `time.sleep` between retry
attempts — up to six seconds of deliberate sleeping. On the event loop that
would stall every in-flight chat stream in the process. `asyncio.to_thread`
keeps it off.
"""

import asyncio
import contextlib
import logging
import os
import socket
import uuid

from app.config import Settings, get_settings
from app.watchtower import store
from app.watchtower.monitor import CheckResult, check_all

logger = logging.getLogger(__name__)

TICK_SECONDS = 15 * 60
STARTUP_DELAY_SECONDS = 60

# How long a lease is good for. Comfortably longer than a tick plus the slowest
# possible sweep (three retry attempts with backoff, per source), so a holder
# that is simply busy does not lose its lease to a peer mid-fetch.
LEASE_SECONDS = 10 * 60

#: Identifies this process in the lease table. Host and PID rather than a bare
#: UUID so a stuck lease in the log names something a person can go and look at.
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


async def run_forever(settings: Settings | None = None) -> None:
    """Tick until cancelled. Started by the app's lifespan."""
    settings = settings or get_settings()

    await asyncio.sleep(STARTUP_DELAY_SECONDS)

    while True:
        try:
            await tick(settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            # ── THE LOOP OUTLIVES ANY ONE FAILURE ────────────────────────────
            #
            # A raise here kills the task, and a dead task is silent: the
            # schedule would simply stop updating with the application still
            # serving happily, which is the exact condition this module exists
            # to prevent. `check_source` already records its own failures; this
            # is for the ones it does not anticipate.
            logger.exception("watchtower_tick_failed worker=%s", WORKER_ID)
        await asyncio.sleep(TICK_SECONDS)


async def tick(settings: Settings | None = None) -> list[CheckResult]:
    """One sweep, if this process holds the lease."""
    settings = settings or get_settings()

    held = await asyncio.to_thread(
        store.acquire_scheduler_lease, WORKER_ID, LEASE_SECONDS, settings
    )
    if not held:
        # Another worker is doing it. Not worth a log line every fifteen
        # minutes on every worker of a multi-worker deployment.
        return []

    results = await asyncio.to_thread(check_all, settings=settings)

    # Only the sweeps that did something. A tick where every source was still
    # inside its interval is the overwhelmingly common case and says nothing.
    notable = [r for r in results if r.outcome != "skipped"]
    if notable:
        logger.info(
            "watchtower_sweep worker=%s %s",
            WORKER_ID,
            " ".join(f"{r.source_id}={r.outcome}" for r in notable),
        )
    return results


def start(app_state: object, settings: Settings | None = None) -> asyncio.Task | None:
    """Create the background task, or explain why there isn't one.

    Returns the task so the lifespan can cancel it, and `None` when the
    scheduler is switched off — which is not an error and is logged as an
    ordinary fact, because "no scheduler" and "a scheduler that died" look
    identical in a log that only mentions the second.
    """
    settings = settings or get_settings()

    if not settings.WATCHTOWER_ENABLED:
        logger.info("watchtower_scheduler_disabled reason=WATCHTOWER_ENABLED_false")
        return None

    logger.info(
        "watchtower_scheduler_started worker=%s tick_s=%d first_sweep_in_s=%d",
        WORKER_ID,
        TICK_SECONDS,
        STARTUP_DELAY_SECONDS,
    )
    return asyncio.create_task(run_forever(settings), name="watchtower")


async def stop(task: asyncio.Task | None) -> None:
    """Cancel and wait, so shutdown does not leave a fetch half-done."""
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    logger.info("watchtower_scheduler_stopped worker=%s", WORKER_ID)
