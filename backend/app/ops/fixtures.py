"""Sample operational data. **Obviously fake, on purpose** — CLAUDE.md rule 5.

## Why none of the names here match the mockups

The design exports use real vessels (WONDER OF THE SEAS), real airlines
(American Airlines, BA 2157), real agents (Delisle Walwyn, S.L. Horsford) and
plausible IMO numbers. Reproducing those as seed data would produce a screen
that is indistinguishable from a real arrivals board while being entirely
invented — which is the precise thing rule 5 exists to prevent, and the more
convincing the render, the worse it gets.

So every value below is unmistakably not real:

* Vessels are `MV SAMPLE …`; IMO numbers are `IMO 0000001`-style and fail the
  IMO check-digit rule, so no lookup will ever resolve one.
* Airlines are `ZZ`, a code IATA does not assign, under `Placeholder Airways`.
* Agents and ports are `Placeholder …` / `Sampleton`.
* Money follows the repeated-digit convention already used by
  `data/knowledge/sample_kb.csv` — 44.44, 111.11 — so a figure from here is
  recognisable on sight as fixture data.

Every response built from this module also carries a `DataSource` with
`kind="fixture"` and a notice, and that notice is enforced by the schema rather
than left to a caller to remember.

Times are computed relative to "now" so the board is never stale-looking, but
the *dates* are the only realistic thing here and they are attached to vessels
that do not exist.
"""

from datetime import UTC, datetime, timedelta

from app.schemas import (
    ContactLocation,
    ContactPoint,
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

FIXTURE_NOTICE = (
    "SAMPLE DATA — not real SCASPA operational information. Every vessel, flight, "
    "agent and figure on this screen is invented for development. Do not use it to "
    "plan anything."
)

UNAVAILABLE_NOTICE = (
    "Live operational data is not connected. SCASPA has not published a feed to this "
    "assistant, so nothing is shown rather than something guessed. Call SCASPA on "
    "869-465-8121 / 2 / 3 for current arrivals."
)


def _at(hours: float) -> datetime:
    """A timestamp `hours` from now, to the minute."""
    return (datetime.now(UTC) + timedelta(hours=hours)).replace(second=0, microsecond=0)


def sample_vessels() -> list[VesselArrival]:
    """Three movements, one per status the UI has to render differently."""
    return [
        VesselArrival(
            id="fx-vessel-1",
            name="MV SAMPLE CARRIER",
            imo="IMO 0000001",
            vessel_type="Container",
            agent="Placeholder Shipping Ltd.",
            berth="Berth 1",
            status="at_berth",
            ata=_at(-3),
        ),
        VesselArrival(
            id="fx-vessel-2",
            name="MV SAMPLE VOYAGER",
            imo="IMO 0000002",
            vessel_type="Cruise",
            agent="Placeholder Cruise Agency",
            berth="Pier 1",
            status="en_route",
            eta=_at(4.5),
        ),
        VesselArrival(
            id="fx-vessel-3",
            name="MV SAMPLE TRADER",
            imo="IMO 0000003",
            vessel_type="Tanker",
            agent="Placeholder Marine Services",
            berth="Berth 2",
            status="scheduled",
            eta=_at(26),
        ),
    ]


def sample_vessel_metrics() -> VesselMetrics:
    return VesselMetrics(
        vessels_at_berth=1,
        berth_capacity=4,
        arrivals_next_24h=1,
        daily_cargo_teu=1111,
    )


def sample_flights() -> list[Flight]:
    """Four movements: on time, delayed, landed, and a departure."""
    return [
        Flight(
            id="fx-flight-1",
            flight_no="ZZ 1111",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Sampleton",
            port_code="XXX",
            gate="G-01",
            status="on_time",
            scheduled_time=_at(2),
        ),
        Flight(
            id="fx-flight-2",
            flight_no="ZZ 2222",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Exampleton",
            port_code="XYZ",
            gate="G-02",
            status="delayed",
            scheduled_time=_at(3),
            estimated_time=_at(4.25),
        ),
        Flight(
            id="fx-flight-3",
            flight_no="ZZ 3333",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Nowhere City",
            port_code="ZZZ",
            gate=None,
            status="landed",
            scheduled_time=_at(-1.5),
        ),
        Flight(
            id="fx-flight-4",
            flight_no="ZZ 4444",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="departure",
            port="Sampleton",
            port_code="XXX",
            gate="G-03",
            status="boarding",
            scheduled_time=_at(1),
        ),
    ]


def sample_flight_metrics() -> FlightMetrics:
    return FlightMetrics(
        total_flights=4,
        on_time_percent=75.0,
        gates_active=3,
        gates_total=4,
    )


def sample_advisory() -> OperationalAdvisory:
    return OperationalAdvisory(
        headline="Sample conditions",
        detail="Placeholder advisory — not a real forecast",
        temperature_c=11.1,
        systems_status="Sample status — not a real operational report",
    )


def sample_tariffs() -> list[TariffRow]:
    """A rate per basis the calculator prices, so every code it applies exists.

    `kb_id` is null throughout: these rates are **not** in the knowledge base and
    saying otherwise would fabricate a citation, which is the one thing
    CLAUDE.md rule 4 will not tolerate. A real tariff export arrives with real
    row ids attached.
    """
    return [
        TariffRow(
            code="SMP-001",
            service="Sample dockage — commercial",
            basis="per ft per 24h",
            amount=1.11,
            category="maritime",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-002",
            service="Sample pilotage — entry",
            basis="per entry",
            amount=111.11,
            category="maritime",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-003",
            service="Sample harbour dues",
            basis="per call",
            amount=44.44,
            category="maritime",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-010",
            service="Sample wharfage — 20 ft container",
            basis="per container",
            amount=22.22,
            category="cargo",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-011",
            service="Sample wharfage — 40 ft container",
            basis="per container",
            amount=44.44,
            category="cargo",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-012",
            service="Sample container handling",
            basis="per container",
            amount=33.33,
            category="cargo",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-013",
            service="Sample container storage",
            basis="per container per day",
            amount=5.55,
            category="cargo",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-020",
            service="Sample passenger head tax",
            basis="per passenger",
            amount=11.11,
            category="passenger",
            as_of="2026-01-01",
        ),
        TariffRow(
            code="SMP-030",
            service="Sample aircraft landing fee",
            basis="per tonne",
            amount=9.99,
            category="aviation",
            as_of="2026-01-01",
        ),
    ]


# ── Contact directory ────────────────────────────────────────────────────────
#
# Unlike everything above, the headline contact route here is **real**: it is the
# same published telephone number and postal address that `app/agent/prompts.py`
# already puts in front of users thousands of times, and that every error
# message ends with. Repeating it is not inventing it.
#
# What is NOT reproduced is the mockup's extension directory — "Operations
# Tower: Ext. 2240", "Berthing Office: Ext. 4450", "Security Gate: Ext. 9110".
# Those numbers appear nowhere in any verified SCASPA source. A wrong extension
# for a security gate is a worse failure than no extension at all, so the
# facilities are listed with the main switchboard and nothing more precise than
# this project can stand behind.

SCASPA_PHONE_VALUE = "869-465-8121 / 2 / 3"
SCASPA_POST = "P.O. Box 963, Bird Rock, Basseterre, St. Kitts"


def contact_locations() -> list[ContactLocation]:
    return [
        ContactLocation(
            name="SCASPA — Authority headquarters",
            address=SCASPA_POST,
            contacts=[
                ContactPoint(label="Telephone", value=SCASPA_PHONE_VALUE, kind="phone"),
                ContactPoint(label="Post", value=SCASPA_POST, kind="post"),
            ],
        ),
        ContactLocation(
            name="R.L. Bradshaw International Airport",
            contacts=[
                ContactPoint(label="Via SCASPA", value=SCASPA_PHONE_VALUE, kind="phone"),
            ],
        ),
        ContactLocation(
            name="Deep Water Harbour",
            contacts=[
                ContactPoint(label="Via SCASPA", value=SCASPA_PHONE_VALUE, kind="phone"),
            ],
        ),
        ContactLocation(
            name="Basseterre Ferry Terminal",
            contacts=[
                ContactPoint(label="Via SCASPA", value=SCASPA_PHONE_VALUE, kind="phone"),
            ],
        ),
        ContactLocation(
            name="Port Zante cruise terminal",
            contacts=[
                ContactPoint(label="Via SCASPA", value=SCASPA_PHONE_VALUE, kind="phone"),
            ],
        ),
    ]


# The mockup's red banner reads "Emergency Protocol Active: Contact Port Security
# Dispatch for Immediate Hazards (Ext: 9110)". That extension is invented, and a
# banner that is permanently "active" trains people to ignore it. Neither ships.
# What ships is the routing advice, which is true and useful.
EMERGENCY_NOTICE = (
    "In an emergency, call the local emergency services. This assistant is not "
    f"monitored and cannot raise an alarm. For urgent port matters call SCASPA on "
    f"{SCASPA_PHONE_VALUE}."
)


def sample_positions() -> list[VesselPosition]:
    """Positions for the map panel. Deliberately in open water off nowhere.

    The coordinates are a tidy synthetic arc a few tenths of a degree apart, not
    plausible approaches to Basseterre. A reader who checks them finds vessels
    sitting in a neat line in the sea, which is the intended tell — the same
    reason the vessel names are `MV SAMPLE …` and the IMOs are `IMO 000000n`.
    """
    return [
        VesselPosition(
            id="fx-vessel-1",
            name="MV SAMPLE CARRIER",
            latitude=17.1,
            longitude=-62.9,
            heading_degrees=111.0,
            speed_knots=11.1,
            reported_by="ais",
            reported_at=_at(-0.2),
        ),
        VesselPosition(
            id="fx-vessel-2",
            name="MV SAMPLE VOYAGER",
            latitude=17.2,
            longitude=-62.8,
            heading_degrees=222.0,
            speed_knots=2.2,
            reported_by="ais",
            reported_at=_at(-0.4),
        ),
        VesselPosition(
            id="fx-vessel-3",
            name="MV SAMPLE TRADER",
            latitude=17.3,
            longitude=-62.7,
            heading_degrees=333.0,
            # Berthed, so no speed. Null rather than 0.0 — "not reported" and
            # "reported as stationary" are different claims.
            speed_knots=None,
            reported_by="manual",
            reported_at=_at(-1.1),
        ),
    ]


def sample_gates() -> list[GateAssignment]:
    """The apron. Gate letters are Z-prefixed, like the ZZ airline code."""
    return [
        GateAssignment(
            gate="Z1",
            status="occupied",
            flight_number="ZZ111",
            airline="Placeholder Air",
            scheduled_at=_at(0.5),
        ),
        GateAssignment(
            gate="Z2",
            status="boarding",
            flight_number="ZZ222",
            airline="Placeholder Air",
            scheduled_at=_at(1.1),
        ),
        GateAssignment(gate="Z3", status="free"),
        GateAssignment(gate="Z4", status="free"),
        GateAssignment(
            gate="Z5",
            status="closed",
            airline="Placeholder Air",
        ),
    ]


def sample_marine_advisories() -> list[MarineAdvisory]:
    """Notices to mariners.

    ── WHY THESE ARE THE BLANDEST STRINGS IN THE FILE ───────────────────────

    The mockup's version reads "High swell advisory for Basseterre Port". A
    fabricated sea-state warning naming a real port is not the same kind of fake
    as a fabricated berth number: someone could read it, believe it, and either
    not sail when they should have or — far worse — treat a *quiet* screen as an
    all-clear. Marine safety information is the one category where invented data
    has a physical consequence.

    So the port is `Placeholder Port`, the headline says "sample", the severity
    is the lowest one, and `FIXTURE_NOTICE` sits above it. Nothing here reads as
    an instruction to a mariner even if the notice above it is missed.
    """
    return [
        MarineAdvisory(
            id="ma-0001",
            port="Placeholder Port",
            headline="Sample advisory — not a real notice to mariners",
            detail=(
                "Placeholder text for the advisory panel. This assistant does not "
                "produce marine weather and does not carry official notices."
            ),
            severity="low",
            issued_at=_at(-2.2),
        ),
    ]


def sample_operator_profile() -> OperatorProfile:
    """The console's identity card. Fixture source only — see `OperatorProfile`.

    Every value is obviously placeholder, in the same register as the vessel
    names: `Sample Agent A. Sample`, `SAMPLE-0000-X`, a division that says
    Placeholder. The design's "Senior Agent Alistair Vance" and
    "SKN-PORT-8829-X" are not used — a plausible-looking name and a
    plausible-looking credential are exactly what someone screenshots and
    circulates, and neither belongs on a screen that has no accounts behind it.

    `notice` is required by the model and rendered as prominently as the card.
    """
    return OperatorProfile(
        display_name="Sample Agent A. Sample",
        division="Placeholder Division",
        agent_id="SAMPLE-0000-X",
        jurisdiction="Placeholder Port",
        role="Placeholder Role",
        last_sync=_at(-0.1),
        active=True,
        verified=True,
        notice=(
            "DEMO ONLY — there is no sign-in. This assistant has no accounts and "
            "never knows who is asking. Every detail on this card is invented for "
            "design review."
        ),
    )


DEPARTMENTS = [
    "Port operations",
    "Cargo and customs paperwork",
    "Cruise and passenger services",
    "Ferry services",
    "Airport services",
    "Tariffs and billing",
    "Something else",
]
