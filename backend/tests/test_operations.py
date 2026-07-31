"""Vessels, flights, tariffs and support.

The safety-critical assertions here are not about shapes. They are:

* a fixture feed always announces itself, and cannot reach production;
* the calculator never invents a rate, and its total always carries its warning;
* no personal detail is accepted by the ticket endpoint;
* the sample data cannot be mistaken for real SCASPA information.
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.memory import ConversationStore, get_conversation_store
from app.config import Settings, get_settings
from app.main import create_app
from app.ops.fixtures import sample_tariffs
from app.ops.source import (
    FixtureOpsSource,
    UnavailableOpsSource,
    build_ops_source,
    filter_flights,
    filter_tariffs,
    filter_vessels,
    get_ops_source,
)
from app.ops.tariffs import build_quote, total_of
from app.schemas import DataSource, TariffQuoteRequest


def _client(settings: Settings, source) -> TestClient:  # noqa: ANN001
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_ops_source] = lambda: source
    app.dependency_overrides[get_conversation_store] = lambda: ConversationStore(settings)
    return TestClient(app)


@pytest.fixture
def fixture_api(tmp_settings) -> TestClient:
    return _client(tmp_settings, FixtureOpsSource())


@pytest.fixture
def empty_api(tmp_settings) -> TestClient:
    return _client(tmp_settings, UnavailableOpsSource())


# ------------------------------------------------------- the source contract


def test_a_fixture_source_cannot_be_silent() -> None:
    """The notice is structural, not a convention someone has to remember."""
    with pytest.raises(ValueError, match="notice"):
        DataSource(kind="fixture", label="Sample", notice=None)
    with pytest.raises(ValueError, match="notice"):
        DataSource(kind="unavailable", label="None", notice="   ")


def test_a_live_source_needs_no_notice() -> None:
    """Only the untrustworthy kinds have to explain themselves."""
    assert DataSource(kind="live", label="AIS feed").notice is None


def test_fixture_responses_carry_the_sample_warning(fixture_api: TestClient) -> None:
    for path in ("/api/vessels", "/api/flights", "/api/tariffs"):
        source = fixture_api.get(path).json()["source"]
        assert source["kind"] == "fixture"
        assert "SAMPLE DATA" in source["notice"]


def test_no_feed_is_an_empty_200_not_an_error(empty_api: TestClient) -> None:
    """Nothing is broken when SCASPA has published no feed.

    A 503 would put a red error panel in front of a user over a feature that was
    never switched on. The design already has an empty state for this.
    """
    for path, key in (("/api/vessels", "vessels"), ("/api/flights", "flights")):
        response = empty_api.get(path)
        assert response.status_code == 200
        body = response.json()
        assert body[key] == []
        assert body["source"]["kind"] == "unavailable"
        assert body["source"]["notice"]


def test_unknown_metrics_are_null_never_zero(empty_api: TestClient) -> None:
    """ "0 vessels at berth" reads as an empty port. "Unknown" is the truth."""
    metrics = empty_api.get("/api/vessels").json()["metrics"]
    assert metrics["vessels_at_berth"] is None
    assert metrics["berth_capacity"] is None


def test_an_unknown_source_name_degrades_rather_than_crashing(tmp_settings) -> None:
    """A typo in a feature flag must not take the chat path down with it."""
    tmp_settings.OPS_DATA_SOURCE = "aisfeed"  # not a real value
    assert isinstance(build_ops_source(tmp_settings), UnavailableOpsSource)


# ------------------------------------------------------------ rule 5: fakery


def test_the_sample_feed_cannot_be_mistaken_for_real_information(
    fixture_api: TestClient,
) -> None:
    """CLAUDE.md rule 5, checked rather than trusted.

    The design exports use real vessels and real airlines. Reproducing them as
    seed data would render an arrivals board indistinguishable from a real one,
    and the better it looks the worse that is.
    """
    vessels = fixture_api.get("/api/vessels").json()["vessels"]
    assert vessels, "the fixture feed should return something"
    for vessel in vessels:
        assert "SAMPLE" in vessel["name"].upper()
        # A real IMO is seven digits with a check digit. These resolve nowhere.
        assert vessel["imo"].startswith("IMO 000")
        assert "Placeholder" in vessel["agent"]

    flights = fixture_api.get("/api/flights").json()["flights"]
    for flight in flights:
        # ZZ is not an IATA-assigned airline code.
        assert flight["airline_code"] == "ZZ"
        assert "Placeholder" in flight["airline"]


def test_fixture_data_is_refused_in_production(tmp_settings, monkeypatch) -> None:
    """Refused at boot, like the wildcard origin — a guard that runs once."""
    tmp_settings.ENV = "prod"
    tmp_settings.OPS_DATA_SOURCE = "fixture"
    tmp_settings.ALLOWED_ORIGINS = "https://example.invalid"
    monkeypatch.setattr("app.main.get_settings", lambda: tmp_settings)

    with pytest.raises(ValueError, match="OPS_DATA_SOURCE"):
        create_app()


def test_production_boots_with_no_feed(tmp_settings, monkeypatch) -> None:
    """The safe setting is not merely allowed, it is the one that works."""
    tmp_settings.ENV = "prod"
    tmp_settings.OPS_DATA_SOURCE = "none"
    tmp_settings.ALLOWED_ORIGINS = "https://example.invalid"
    monkeypatch.setattr("app.main.get_settings", lambda: tmp_settings)

    assert create_app() is not None


# ---------------------------------------------------------------- filtering


def test_vessel_search_matches_name_and_imo() -> None:
    rows = FixtureOpsSource().vessels()
    assert len(filter_vessels(rows, query="voyager")) == 1
    assert len(filter_vessels(rows, query="0000003")) == 1
    assert filter_vessels(rows, query="nothing here") == []


def test_vessel_filters_combine() -> None:
    rows = FixtureOpsSource().vessels()
    assert len(filter_vessels(rows, vessel_type="Cruise")) == 1
    assert len(filter_vessels(rows, status="at_berth")) == 1
    assert filter_vessels(rows, vessel_type="Cruise", status="at_berth") == []


def test_flight_search_matches_number_and_port() -> None:
    rows = FixtureOpsSource().flights()
    assert len(filter_flights(rows, query="ZZ 2222")) == 1
    assert len(filter_flights(rows, query="sampleton")) == 2
    assert len(filter_flights(rows, direction="departure")) == 1


def test_tariff_category_chips_survive_filtering(fixture_api: TestClient) -> None:
    """Chips come from the whole table.

    Derived from the filtered slice, selecting a category would remove every
    other chip and leave no way back.
    """
    body = fixture_api.get("/api/tariffs", params={"category": "cargo"}).json()
    assert {row["category"] for row in body["tariffs"]} == {"cargo"}
    assert set(body["categories"]) >= {"maritime", "cargo", "aviation", "passenger"}


def test_tariff_search_matches_code_and_service() -> None:
    rows = sample_tariffs()
    assert len(filter_tariffs(rows, query="SMP-013")) == 1
    assert filter_tariffs(rows, query="storage")[0].code == "SMP-013"


def test_paging_reports_the_full_match_count(fixture_api: TestClient) -> None:
    """`total` is matches, not the page — or pagination cannot be rendered."""
    body = fixture_api.get("/api/vessels", params={"limit": 1}).json()
    assert len(body["vessels"]) == 1
    assert body["total"] == 3


# --------------------------------------------------------------- the quote


def test_a_quote_prices_only_published_rates(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "40ft", "units": 2, "storage_days": 5},
    ).json()

    published = {row.code: row.amount for row in sample_tariffs()}
    for line in body["line_items"]:
        assert line["rate"] == published[line["code"]], "a rate was not the published one"


def test_the_printed_lines_add_up_to_the_printed_total(fixture_api: TestClient) -> None:
    """A reader who checks the arithmetic must not find it off by a cent.

    This is why each line is rounded before summing rather than the total being
    computed from raw rates.
    """
    body = fixture_api.post(
        "/api/tariffs/quote",
        json={"category": "cargo", "container_size": "20ft", "units": 3, "storage_days": 7},
    ).json()

    assert round(sum(line["amount"] for line in body["line_items"]), 2) == body["subtotal"]
    assert body["subtotal"] == body["total"]


def test_a_total_always_carries_its_warning(fixture_api: TestClient) -> None:
    """The one thing that must never be droppable."""
    body = fixture_api.post("/api/tariffs/quote", json={"category": "maritime"}).json()

    assert body["derived"] is True
    disclaimer = body["disclaimer"]
    assert "Estimate only" in disclaimer
    assert "not an official customs assessment" in disclaimer
    assert "869-465-8121" in disclaimer


def test_a_missing_rate_is_reported_not_guessed() -> None:
    """A total quietly missing its largest component is worse than no total."""

    class NoTariffs(FixtureOpsSource):
        def tariffs(self):  # noqa: ANN201
            return []

    lines, unpriced = build_quote(
        TariffQuoteRequest(category="cargo", units=2, container_size="20ft"), NoTariffs()
    )

    assert lines == []
    assert "SMP-010" in unpriced
    assert total_of(lines) == 0.0


def test_currency_conversion_is_refused(fixture_api: TestClient) -> None:
    """Prompt rule 4 forbids converting a published fee. So does the calculator.

    A converted total would apply an exchange rate nobody published, with more
    authority than a sentence carries.
    """
    response = fixture_api.post(
        "/api/tariffs/quote", json={"category": "cargo", "units": 1, "currency": "USD"}
    )
    assert response.status_code == 422


def test_an_empty_request_produces_no_invented_lines(fixture_api: TestClient) -> None:
    """Nothing entered, nothing charged for — except the per-call maritime dues."""
    body = fixture_api.post("/api/tariffs/quote", json={"category": "cargo"}).json()
    assert body["line_items"] == []
    assert body["total"] == 0.0
    # Still warns. A zero is a figure too.
    assert body["disclaimer"]


# --------------------------------------------------------------- support


def test_a_ticket_returns_a_reference_and_a_next_step(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "Query about container storage",
            "details": "Placeholder details for a fixture test.",
        },
    ).json()

    assert body["reference"].startswith("SC-")
    # Nobody will contact them, and the response has to say so.
    assert "Quote reference" in body["next_step"]
    assert "869-465-8121" in body["next_step"]


def test_the_ticket_endpoint_accepts_no_personal_details(fixture_api: TestClient) -> None:
    """The design collected a name, an email and a phone number. None are taken.

    Pydantic is configured to ignore unknown keys rather than reject them, so
    this asserts the important half: whatever a client sends, none of it comes
    back and none of it is a field. `docs/privacy.md` stays true.
    """
    response = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "Test",
            "details": "Test details.",
            "full_name": "A Person",
            "email": "person@example.invalid",
            "phone": "555-0100",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert set(body) == {
        "reference",
        "department",
        "expected_response",
        "next_step",
        "transcript_included",
        "request_id",
    }
    serialised = str(body)
    assert "A Person" not in serialised
    assert "person@example.invalid" not in serialised
    assert "555-0100" not in serialised


def test_a_transcript_is_only_attached_when_asked_for(fixture_api: TestClient) -> None:
    """Defaulting this on would forward someone's questions to a mailbox."""
    body = fixture_api.post(
        "/api/support/ticket",
        json={"department": "Port operations", "subject": "S", "details": "D"},
    ).json()
    assert body["transcript_included"] is False


def test_a_transcript_cannot_be_attached_without_a_conversation(fixture_api: TestClient) -> None:
    body = fixture_api.post(
        "/api/support/ticket",
        json={
            "department": "Port operations",
            "subject": "S",
            "details": "D",
            "include_transcript": True,
            "conversation_id": "00000000-0000-4000-8000-000000000000",
        },
    ).json()
    # No such conversation in this process, so nothing to attach — and it says so
    # rather than claiming it attached something.
    assert body["transcript_included"] is False


def test_a_blank_ticket_is_rejected(fixture_api: TestClient) -> None:
    response = fixture_api.post(
        "/api/support/ticket",
        json={"department": "Port operations", "subject": "   ", "details": "D"},
    )
    assert response.status_code == 422


def test_the_directory_publishes_the_real_contact_route(fixture_api: TestClient) -> None:
    """The phone number is real and repeating it is not inventing it."""
    body = fixture_api.get("/api/support/directory").json()
    serialised = str(body)

    assert "869-465-8121" in serialised
    assert body["departments"], "the ticket form needs its department options"
    assert body["emergency"], "the banner text must be present"


def test_the_directory_invents_no_extensions(fixture_api: TestClient) -> None:
    """The mockup's "Ext. 9110" for a security gate appears in no verified source.

    A wrong extension for a security gate is a worse failure than no extension.
    """
    serialised = str(fixture_api.get("/api/support/directory").json())
    for invented in ("9110", "2240", "4450", "3315", "1102", "4481"):
        assert invented not in serialised


def test_support_stays_up_when_no_feed_is_configured(empty_api: TestClient) -> None:
    """Support must never be the thing that goes dark.

    It is what someone reaches for when everything else has told them to call.
    """
    body = empty_api.get("/api/support/directory").json()
    assert "869-465-8121" in str(body)
    assert body["locations"]


# ---------------------------------------------------------------- rate limits


def test_reading_a_board_does_not_spend_the_budget_for_asking_a_question() -> None:
    """Browsing an arrivals board is naturally several requests.

    A search, a filter, a refresh — and if those came out of the chat budget then
    paging through vessel arrivals would leave a traveller unable to ask a
    question, having spent their allowance on page views they never thought of as
    requests. Reading a feed costs a dictionary lookup; a chat turn costs a model
    call. The budgets are separate and sized accordingly.
    """
    from app.ratelimit import RateLimiter

    limiter = RateLimiter()
    chat_limit = limiter.limit_for("chat")

    assert limiter.limit_for("ops") > chat_limit, "reading must be cheaper than asking"
    assert limiter.limit_for("voice") < chat_limit, "voice must stay stricter than chat"

    # And the scopes are independent: exhausting one leaves the other untouched.
    for _ in range(chat_limit):
        assert limiter.check("198.51.100.7", scope="chat").allowed
    assert not limiter.check("198.51.100.7", scope="chat").allowed
    assert limiter.check("198.51.100.7", scope="ops").allowed
