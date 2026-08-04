"""Sample operational data, written to the fixture-integrity contract.

**Read `docs/decisions.md` 0032 before changing a value here.** The rule it sets
is not "make everything obviously fake" — that was the old convention, and it
stopped working the moment these screens needed to look like the real thing:

    Realistic in every field that shapes the layout.
    Synthetic in every field that could be written down and acted on.

So this module is deliberately two-faced, and which face a field wears is not a
matter of taste:

| Realistic — these drive the rendering | Synthetic — these could be quoted |
| ------------------------------------- | --------------------------------- |
| Berth and pier identifiers            | Vessel names (`MV SAMPLE …`)      |
| Gate and stand designators            | IMO numbers (`IMO 000000n`)       |
| Times, statuses, directions           | Airline names and codes (`ZZ`)    |
| Route structure, column shape         | Flight numbers                    |
| Counts that shape a tile              | **Every money amount**            |

The realistic half is what makes the fixture worth having: sorting, the ETA/ATA
distinction, the struck-through revised time, the status-chip distribution and
the ≤640px row cards are all exercised only by data that behaves like data. The
synthetic half is what keeps a screenshot of this board from being mistaken for
an operational fact.

## The design exports are not reproduced, and that has not changed

They use real vessels (WONDER OF THE SEAS), real airlines (American Airlines,
BA 2157) and real agents (Delisle Walwyn, S.L. Horsford). Reproducing those
would produce a board indistinguishable from a real one — which is precisely
what CLAUDE.md rule 5 exists to prevent, and the more convincing the render the
worse it gets.

## Times are the documented exception

Realistic, offset from the current hour, and **deterministic — no RNG**. A board
where every arrival lands at 11:11 reads as broken rather than as labelled, and
a reader who decides the screen is malfunctioning has stopped reading the notice
above it. `_at` sets the minute per record rather than inheriting it from
`now()`, or every row on the board would share a minute. See 0032.

## What is structural rather than conventional

Every response built from this module carries a `DataSource` with
`kind="fixture"` and a notice the schema refuses to omit, and `main.py` refuses
to boot with this source when `ENV=prod`. Those two guards are load-bearing now
that the values look real — they are no longer belt-and-braces.
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


def _at(hours: int, minute: int) -> datetime:
    """A timestamp `hours` from the current hour, at `minute` past it.

    Anchored to the **hour**, not to `now()`, and the minute is supplied by the
    caller. Deriving every time from `now()` and zeroing only the seconds gave
    every row on the board the same minute — `14:37`, `16:37`, `22:37` — which
    is a tell in its own right and a sillier one than repeated digits.

    Deterministic by construction: no clock reading beyond the current hour and
    no randomness, so the same call produces the same board and a test can
    assert against the offset. See `docs/decisions.md` 0032.
    """
    base = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    return base + timedelta(hours=hours, minutes=minute)


def sample_vessels() -> list[VesselArrival]:
    """Eleven movements across three facilities.

    ## What this set is shaped to exercise

    * **All five `VesselStatus` values.** `departed` and `unknown` had never been
      produced by any fixture — `08-blocked-and-forbidden.md` #6 lists them as
      built and unrendered, and "a chip that has never been rendered is a chip
      nobody has checked". They are here now.
    * **All four ETA/ATA combinations** §5.4 draws: predicted only, both,
      arrived-unannounced, and neither reported.
    * **Three facilities**, so the `facility` filter has something to separate.
      Cargo and tankers at the Deep Water Harbour, cruise at Port Zante's two
      piers, ferries at Basseterre — and one movement with **no facility at
      all**, because a feed that does not attribute a record is a real state the
      table has to render.
    * **Enough rows to page.** Eleven against a 25-row page still collapses the
      pagination to its single-page readout, but it fills a screen.

    Berths and piers are real-shaped: the Deep Water Harbour's berths are
    numbered and Port Zante has two piers (which the knowledge base confirms).
    Names, IMOs and agents are not, and must not become so.
    """
    return [
        # ── Deep Water Harbour ───────────────────────────────────────────────
        VesselArrival(
            id="fx-vessel-1",
            name="MV SAMPLE CARRIER",
            imo="IMO 0000001",
            vessel_type="Container",
            agent="Placeholder Shipping Ltd.",
            berth="Berth 1",
            facility="deep_water_harbour",
            status="at_berth",
            # Both times: the record is upright and full strength, the
            # prediction recedes. §5.4's second combination.
            eta=_at(-4, 15),
            ata=_at(-3, 42),
        ),
        VesselArrival(
            id="fx-vessel-2",
            name="MV SAMPLE TRADER",
            imo="IMO 0000002",
            vessel_type="Tanker",
            agent="Placeholder Marine Services",
            berth="Berth 2",
            facility="deep_water_harbour",
            status="at_berth",
            # Arrived unannounced — no ETA was ever filed. §5.4's third.
            ata=_at(-7, 5),
        ),
        VesselArrival(
            id="fx-vessel-3",
            name="MV SAMPLE MERIDIAN",
            imo="IMO 0000003",
            vessel_type="Container",
            agent="Placeholder Shipping Ltd.",
            berth="Berth 3",
            facility="deep_water_harbour",
            status="en_route",
            eta=_at(3, 20),
        ),
        VesselArrival(
            id="fx-vessel-4",
            name="MV SAMPLE PROVIDER",
            imo="IMO 0000004",
            vessel_type="General cargo",
            agent="Placeholder Marine Services",
            berth="Berth 4",
            facility="deep_water_harbour",
            status="scheduled",
            eta=_at(19, 45),
        ),
        VesselArrival(
            id="fx-vessel-5",
            name="MV SAMPLE ENDEAVOUR",
            imo="IMO 0000005",
            vessel_type="Container",
            agent="Placeholder Shipping Ltd.",
            berth="Berth 1",
            facility="deep_water_harbour",
            # BLOCKED no longer: the first `departed` any fixture has produced.
            # §5.4 — settled and closed, a fact rather than an alert, so it
            # takes no status hue.
            status="departed",
            eta=_at(-28, 30),
            ata=_at(-27, 55),
        ),
        # ── Port Zante ───────────────────────────────────────────────────────
        VesselArrival(
            id="fx-vessel-6",
            name="MV SAMPLE VOYAGER",
            imo="IMO 0000006",
            vessel_type="Cruise",
            agent="Placeholder Cruise Agency",
            berth="Pier 1",
            facility="port_zante",
            status="at_berth",
            eta=_at(-6, 0),
            ata=_at(-6, 12),
        ),
        VesselArrival(
            id="fx-vessel-7",
            name="MV SAMPLE HORIZON",
            imo="IMO 0000007",
            vessel_type="Cruise",
            agent="Placeholder Cruise Agency",
            berth="Pier 2",
            facility="port_zante",
            status="en_route",
            eta=_at(2, 35),
        ),
        VesselArrival(
            id="fx-vessel-8",
            name="MV SAMPLE AURORA",
            imo="IMO 0000008",
            vessel_type="Cruise",
            agent="Placeholder Cruise Agency",
            berth="Pier 1",
            facility="port_zante",
            status="scheduled",
            eta=_at(26, 10),
        ),
        # ── Basseterre Ferry Terminal ────────────────────────────────────────
        VesselArrival(
            id="fx-vessel-9",
            name="MV SAMPLE CROSSING",
            imo="IMO 0000009",
            vessel_type="Passenger ferry",
            agent="Placeholder Ferry Services",
            berth="Ferry berth 1",
            facility="basseterre_ferry_terminal",
            status="at_berth",
            ata=_at(-1, 25),
        ),
        VesselArrival(
            id="fx-vessel-10",
            name="MV SAMPLE PASSAGE",
            imo="IMO 0000010",
            vessel_type="Passenger ferry",
            agent="Placeholder Ferry Services",
            berth="Ferry berth 2",
            facility="basseterre_ferry_terminal",
            status="en_route",
            eta=_at(1, 50),
        ),
        # ── Reported by no facility, and neither time filed ───────────────────
        VesselArrival(
            id="fx-vessel-11",
            name="MV SAMPLE LEEWARD",
            imo="IMO 0000011",
            vessel_type="General cargo",
            agent="Placeholder Marine Services",
            berth="",
            # Null, not a guess. A feed that does not attribute a movement is a
            # real state and the table renders the absence.
            facility=None,
            # The other blocked chip: `unknown` gets a genuine empty treatment —
            # hollow dot, dashed outline, no status hue. Rendering it as
            # "Expected" or leaving the cell blank would both be inventions.
            status="unknown",
            # §5.4's fourth combination: neither reported, two em dashes, no
            # guess.
        ),
    ]


def sample_vessel_metrics() -> VesselMetrics:
    """The four tiles above the vessel table — §5.3.

    Every figure here is the **feed's**, not a recount of the rows: §5's
    implementation requirement #5, "never derive a count from the visible rows".
    They happen to agree with the fixture above, and they agree because the
    fixture was written to them rather than the other way round.

    **`berth_occupancy` is still absent**, and that is the design's own answer:
    §5.3 gives that tile the em dash and calls rendering `0` there "the single
    most dangerous default in the product". No field exists for it and none is
    invented here.
    """
    return VesselMetrics(
        # Four alongside: three at the Deep Water Harbour and Port Zante, one at
        # the ferry terminal.
        vessels_at_berth=4,
        berth_capacity=11,
        arrivals_next_24h=7,
        # A calendar day, which the rolling window above is not. Fewer, because
        # the window reaches into tomorrow morning.
        arrivals_today=5,
        # A quotable statistic, so it keeps the repeated-digit convention: "the
        # port handles 1,111 TEU a day" is exactly the sentence that must not
        # survive a screenshot.
        daily_cargo_teu=1111,
    )


def sample_flights() -> list[Flight]:
    """Twelve movements at RLB — seven arrivals, five departures.

    ## What this set is shaped to exercise

    * **All six `FlightStatus` values**, including `arrived`, which no fixture
      has ever produced (`08-blocked-and-forbidden.md` #6). §5.5: "`landed` and
      `arrived` differ by glyph and label, **never by hue**" — a rule nobody
      could check while one of the two never rendered.
    * **The revised-time cell.** Two delays carry both a scheduled and an
      estimated time, so §5.5's struck-through original beside the caution
      revision has something to draw. A passenger who sees only the new time
      cannot tell that it moved.
    * **A null gate**, which reads "not reported" and never "TBD" — that sounds
      like the Authority has decided and is withholding.
    * **Three airline codes**, so the 26px avatar is not one repeated mark, plus
      one flight with **no code at all**: §5.5's dashed avatar with a plane
      glyph, "never invented initials".

    `ZZ`, `QQ` and `XX` are not assigned by IATA, and the port codes are not
    real either. The routes are shaped like routes; the places are not places.
    """
    return [
        # ── Arrivals ─────────────────────────────────────────────────────────
        Flight(
            id="fx-flight-1",
            flight_no="ZZ 1111",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Sampleton",
            port_code="XXX",
            gate="Gate 1",
            status="landed",
            facility="rlb_airport",
            scheduled_time=_at(-2, 5),
        ),
        Flight(
            id="fx-flight-2",
            flight_no="QQ 2222",
            airline="Sample Air",
            airline_code="QQ",
            direction="arrival",
            port="Exampleton",
            port_code="XYZ",
            gate="Gate 2",
            # The first `arrived` any fixture has produced. Distinct from
            # `landed` by glyph and label, never by hue — the pair that could
            # not be checked until both existed.
            status="arrived",
            facility="rlb_airport",
            scheduled_time=_at(-1, 40),
        ),
        Flight(
            id="fx-flight-3",
            flight_no="ZZ 3333",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Nowhere City",
            port_code="ZZZ",
            gate="Gate 4",
            status="delayed",
            facility="rlb_airport",
            # Both times, so the struck-through original renders beside the
            # revision.
            scheduled_time=_at(1, 15),
            estimated_time=_at(2, 30),
        ),
        Flight(
            id="fx-flight-4",
            flight_no="XX 4444",
            airline="Example Airlines",
            airline_code="XX",
            direction="arrival",
            port="Placeholder Bay",
            port_code="PBY",
            # Null: "not reported", never "TBD".
            gate=None,
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(2, 50),
        ),
        Flight(
            id="fx-flight-5",
            flight_no="QQ 5555",
            airline="Sample Air",
            airline_code="QQ",
            direction="arrival",
            port="Sampleton",
            port_code="XXX",
            gate="Gate 3",
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(4, 10),
        ),
        Flight(
            id="fx-flight-6",
            flight_no="ZZ 6666",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="arrival",
            port="Exampleton",
            port_code="XYZ",
            gate=None,
            status="cancelled",
            facility="rlb_airport",
            scheduled_time=_at(5, 25),
        ),
        Flight(
            id="fx-flight-7",
            flight_no="SP 7777",
            # No code on the wire — §5.5's dashed avatar with a plane glyph.
            # Never invented initials.
            airline="Placeholder Charter",
            airline_code="",
            direction="arrival",
            port="Nowhere City",
            port_code="ZZZ",
            gate=None,
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(7, 45),
        ),
        # ── Departures ───────────────────────────────────────────────────────
        Flight(
            id="fx-flight-8",
            flight_no="ZZ 1112",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="departure",
            port="Sampleton",
            port_code="XXX",
            gate="Gate 1",
            status="boarding",
            facility="rlb_airport",
            scheduled_time=_at(0, 55),
        ),
        Flight(
            id="fx-flight-9",
            flight_no="QQ 2223",
            airline="Sample Air",
            airline_code="QQ",
            direction="departure",
            port="Exampleton",
            port_code="XYZ",
            gate="Gate 2",
            status="delayed",
            facility="rlb_airport",
            scheduled_time=_at(1, 30),
            estimated_time=_at(3, 5),
        ),
        Flight(
            id="fx-flight-10",
            flight_no="XX 4445",
            airline="Example Airlines",
            airline_code="XX",
            direction="departure",
            port="Placeholder Bay",
            port_code="PBY",
            gate="Gate 5",
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(3, 40),
        ),
        Flight(
            id="fx-flight-11",
            flight_no="ZZ 3334",
            airline="Placeholder Airways",
            airline_code="ZZ",
            direction="departure",
            port="Nowhere City",
            port_code="ZZZ",
            gate="Gate 6",
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(6, 20),
        ),
        Flight(
            id="fx-flight-12",
            flight_no="QQ 5556",
            airline="Sample Air",
            airline_code="QQ",
            direction="departure",
            port="Sampleton",
            port_code="XXX",
            gate=None,
            status="on_time",
            facility="rlb_airport",
            scheduled_time=_at(9, 0),
        ),
    ]


def sample_flight_metrics() -> FlightMetrics:
    """§5.3's three tiles, plus the two the console reads.

    The server's figures, never a recount of the visible rows — and note that
    `total_flights` counts **both directions across the whole feed**, which is
    exactly why it is not one of the three the design draws and why rendering it
    under "Arrivals today" reported four arrivals where the feed held three.
    """
    return FlightMetrics(
        total_flights=12,
        # A quotable statistic — "SCASPA runs at 77.7% on time" is a sentence
        # that must not survive a screenshot — so it keeps repeated digits.
        on_time_percent=77.7,
        gates_active=4,
        gates_total=8,
        # §5.3's three. Seven arrivals and five departures in the set above;
        # two of the twelve are delayed.
        arrivals_today=7,
        departures_today=5,
        delayed=2,
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
            id="fx-vessel-3",
            name="MV SAMPLE MERIDIAN",
            latitude=17.1,
            longitude=-62.9,
            heading_degrees=111.0,
            speed_knots=11.1,
            reported_by="ais",
            reported_at=_at(0, -12),
        ),
        VesselPosition(
            id="fx-vessel-7",
            name="MV SAMPLE HORIZON",
            latitude=17.2,
            longitude=-62.8,
            heading_degrees=222.0,
            speed_knots=2.2,
            reported_by="ais",
            reported_at=_at(0, -24),
        ),
        VesselPosition(
            id="fx-vessel-1",
            name="MV SAMPLE CARRIER",
            latitude=17.3,
            longitude=-62.7,
            heading_degrees=333.0,
            # Berthed, so no speed. Null rather than 0.0 — "not reported" and
            # "reported as stationary" are different claims, and §6.7 will not
            # print `0.0 kn` for the first.
            speed_knots=None,
            reported_by="manual",
            reported_at=_at(-1, 5),
        ),
        VesselPosition(
            id="fx-vessel-10",
            name="MV SAMPLE PASSAGE",
            latitude=17.25,
            longitude=-62.75,
            # Null heading draws **no arrow at all** — §6.7. A marker pointing
            # somewhere it was never told to point is a fabricated bearing.
            heading_degrees=None,
            speed_knots=8.8,
            # The third `reported_by`, which no fixture has produced: a
            # dead-reckoning estimate, drawn hollow and dashed so it cannot be
            # read as a transponder fix.
            reported_by="estimated",
            reported_at=_at(-2, 40),
        ),
    ]


def sample_gates() -> list[GateAssignment]:
    """The apron — eight stands, which is what §6.8 draws ("2 active of 8").

    Designators are bare numbers because §6.8 renders them tabular. Flight
    numbers on the occupied stands match the arrivals and departures above, so
    the gate map and the flight table cannot disagree about what is where.

    `active` is **not** computed here: `/api/ops/gates` counts it server-side
    from these rows, so the map and the flights screen's tile cannot drift.
    Occupied and boarding are active; free and closed are not — which makes it
    four, matching `FlightMetrics.gates_active`.
    """
    return [
        GateAssignment(
            gate="1",
            status="occupied",
            flight_number="ZZ 1111",
            airline="Placeholder Airways",
            facility="rlb_airport",
            scheduled_at=_at(-2, 5),
        ),
        GateAssignment(
            gate="2",
            status="occupied",
            flight_number="QQ 2222",
            airline="Sample Air",
            facility="rlb_airport",
            scheduled_at=_at(-1, 40),
        ),
        GateAssignment(
            gate="3",
            status="boarding",
            flight_number="ZZ 1112",
            airline="Placeholder Airways",
            facility="rlb_airport",
            scheduled_at=_at(0, 55),
        ),
        GateAssignment(
            gate="4",
            status="boarding",
            flight_number="QQ 2223",
            airline="Sample Air",
            facility="rlb_airport",
            scheduled_at=_at(1, 30),
        ),
        GateAssignment(gate="5", status="free", facility="rlb_airport"),
        GateAssignment(gate="6", status="free", facility="rlb_airport"),
        GateAssignment(gate="7", status="free", facility="rlb_airport"),
        GateAssignment(
            gate="8",
            status="closed",
            airline="Placeholder Airways",
            facility="rlb_airport",
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
            issued_at=_at(-2, 15),
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
        last_sync=_at(0, -8),
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
