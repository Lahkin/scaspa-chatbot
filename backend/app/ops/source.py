"""Where operational data comes from, behind one interface.

Two implementations today — nothing configured, and the sample feed. A real AIS
or AODB integration is a third, and the routers do not change when it lands.

Filtering and paging live here rather than in the router (CLAUDE.md rule 7) and
are applied uniformly, so a future live source cannot accidentally implement
"search" differently from the fixture one and make a bug that only appears in
production.
"""

import logging
from datetime import UTC, datetime
from typing import TypeVar

from app.config import Settings, get_settings
from app.ops import fixtures
from app.schemas import (
    ContactLocation,
    DataSource,
    Flight,
    FlightMetrics,
    GateAssignment,
    MarineAdvisory,
    OperationalAdvisory,
    OperatorProfile,
    TariffRow,
    VesselArrival,
    VesselMetrics,
    VesselPosition,
)

logger = logging.getLogger(__name__)

# Python 3.11: PEP 695 (`def f[T](...)`) is 3.12+, so the old spelling.
T = TypeVar("T")


def _matches(haystack: object, needle: str) -> bool:
    """Case-insensitive substring test over any stringable field."""
    return needle in str(haystack or "").lower()


class OpsSource:
    """Interface for a provider of operational data."""

    kind: str = "unavailable"
    label: str = "No source configured"

    def describe(self) -> DataSource:  # pragma: no cover — overridden
        raise NotImplementedError

    def vessels(self) -> list[VesselArrival]:
        return []

    def vessel_metrics(self) -> VesselMetrics:
        return VesselMetrics()

    def flights(self) -> list[Flight]:
        return []

    def flight_metrics(self) -> FlightMetrics:
        return FlightMetrics()

    def advisory(self) -> OperationalAdvisory | None:
        return None

    # The four below default to nothing, which is the honest answer for every
    # source that has no AIS, no apron feed and no notices to mariners — that is
    # to say, every real source this project has ever had. A panel that gets an
    # empty list renders its "not connected" state, which is the same thing it
    # rendered when these methods did not exist.
    def positions(self) -> list[VesselPosition]:
        return []

    def gates(self) -> list[GateAssignment]:
        return []

    def marine_advisories(self) -> list[MarineAdvisory]:
        return []

    def operator_profile(self) -> OperatorProfile | None:
        """The console identity card. Null everywhere except the fixture source.

        Not "the current user" — there isn't one and there cannot be. See the
        long note on `OperatorProfile`.
        """
        return None

    def tariffs(self) -> list[TariffRow]:
        return []

    def contact_locations(self) -> list[ContactLocation]:
        # The published telephone number and postal address are known regardless
        # of whether an operational feed exists — they are in the system prompt
        # and on the bottom of every error message. Support must never be the
        # thing that goes dark.
        return fixtures.contact_locations()


class UnavailableOpsSource(OpsSource):
    """The default. Answers honestly that there is nothing to show.

    Deliberately a **200 with an empty list**, not a 503. Nothing is broken:
    SCASPA has not published a feed, which is a fact about the world rather than
    a failure, and the design already has an empty state for exactly this. A 503
    would put a red error panel in front of a user over a feature that was never
    switched on.
    """

    kind = "unavailable"
    label = "No operational feed configured"

    def describe(self) -> DataSource:
        return DataSource(
            kind="unavailable",
            label=self.label,
            as_of=None,
            notice=fixtures.UNAVAILABLE_NOTICE,
        )


class FixtureOpsSource(OpsSource):
    """The obviously-fake sample feed. Development only — see `app/ops/fixtures`."""

    kind = "fixture"
    label = "Sample data (development fixture)"

    def describe(self) -> DataSource:
        return DataSource(
            kind="fixture",
            label=self.label,
            as_of=datetime.now(UTC),
            notice=fixtures.FIXTURE_NOTICE,
        )

    def vessels(self) -> list[VesselArrival]:
        return fixtures.sample_vessels()

    def vessel_metrics(self) -> VesselMetrics:
        return fixtures.sample_vessel_metrics()

    def flights(self) -> list[Flight]:
        return fixtures.sample_flights()

    def flight_metrics(self) -> FlightMetrics:
        return fixtures.sample_flight_metrics()

    def advisory(self) -> OperationalAdvisory | None:
        return fixtures.sample_advisory()

    def positions(self) -> list[VesselPosition]:
        return fixtures.sample_positions()

    def gates(self) -> list[GateAssignment]:
        return fixtures.sample_gates()

    def marine_advisories(self) -> list[MarineAdvisory]:
        return fixtures.sample_marine_advisories()

    def operator_profile(self) -> OperatorProfile | None:
        return fixtures.sample_operator_profile()

    def tariffs(self) -> list[TariffRow]:
        return fixtures.sample_tariffs()


# ── Filtering, shared by every source ────────────────────────────────────────


def filter_vessels(
    rows: list[VesselArrival],
    query: str | None = None,
    vessel_type: str | None = None,
    berth: str | None = None,
    status: str | None = None,
) -> list[VesselArrival]:
    """Apply the search box and the two filter selects from the design."""
    needle = (query or "").strip().lower()
    out = rows
    if needle:
        out = [v for v in out if _matches(v.name, needle) or _matches(v.imo, needle)]
    if vessel_type:
        out = [v for v in out if v.vessel_type.lower() == vessel_type.strip().lower()]
    if berth:
        out = [v for v in out if v.berth.lower() == berth.strip().lower()]
    if status:
        out = [v for v in out if v.status == status]
    return out


def filter_flights(
    rows: list[Flight],
    query: str | None = None,
    airline: str | None = None,
    status: str | None = None,
    direction: str | None = None,
) -> list[Flight]:
    """Apply the flight search box and its filter selects."""
    needle = (query or "").strip().lower()
    out = rows
    if needle:
        out = [
            f
            for f in out
            if _matches(f.flight_no, needle)
            or _matches(f.port, needle)
            or _matches(f.port_code, needle)
        ]
    if airline:
        wanted = airline.strip().lower()
        out = [f for f in out if wanted in (f.airline.lower(), f.airline_code.lower())]
    if status:
        out = [f for f in out if f.status == status]
    if direction:
        out = [f for f in out if f.direction == direction]
    return out


def filter_tariffs(
    rows: list[TariffRow],
    query: str | None = None,
    category: str | None = None,
) -> list[TariffRow]:
    """Apply the tariff search box and the category chips."""
    needle = (query or "").strip().lower()
    out = rows
    if category:
        out = [t for t in out if t.category == category]
    if needle:
        out = [t for t in out if _matches(t.service, needle) or _matches(t.code, needle)]
    return out


def paginate(rows: list[T], limit: int, offset: int) -> list[T]:
    """One slice helper, so every list endpoint pages identically."""
    return rows[offset : offset + limit]


# ── Selection ────────────────────────────────────────────────────────────────

_source: OpsSource | None = None


def build_ops_source(settings: Settings | None = None) -> OpsSource:
    """Pick the source named by `OPS_DATA_SOURCE`.

    An unrecognised value falls back to `unavailable` with a warning rather than
    refusing to boot. A typo in a feature flag should degrade to "the feature is
    off", not take the whole assistant down with it — the chat path has nothing
    to do with this setting.
    """
    settings = settings or get_settings()
    choice = settings.OPS_DATA_SOURCE.strip().lower()

    if choice == "fixture":
        return FixtureOpsSource()
    if choice not in {"none", ""}:
        logger.warning("unknown_ops_data_source value=%r — serving no operational data", choice)
    return UnavailableOpsSource()


def get_ops_source() -> OpsSource:
    """Process-wide source. A FastAPI dependency, overridable in tests."""
    global _source  # noqa: PLW0603 — one per process, matching the other providers
    if _source is None:
        _source = build_ops_source()
    return _source


def reset_ops_source() -> None:
    """Drop the cached source. Used by tests."""
    global _source  # noqa: PLW0603
    _source = None
