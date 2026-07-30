"""Chart tests.

The negative cases are the point. An invented tariff rendered as a confident bar
chart is the most dangerous output this product could produce, because a chart is
believed more readily than a sentence and somebody will budget against it.

Every test here proves a specific route to that outcome is closed **in code**,
not merely discouraged in the prompt.
"""

import pytest
from pydantic import ValidationError

from app.agent.tools import figure_in_text, make_chart, number_forms, turn_context
from app.rag.retriever import RetrievedChunk
from app.schemas import MAX_POINTS, MAX_SERIES, ChartPoint, ChartSeries, ChartSpec

# A source row whose text really does contain the figures, mirroring the fixture.
SOURCE_TEXT = (
    "Category: cruise — statistics\n"
    "Question: How many cruise passengers arrive each month?\n"
    "Answer: SAMPLE DATA — illustrative figures, not real. Placeholder monthly cruise "
    "passengers: January 1111, February 2222, March 3333, April 4444."
)

OFFICIAL_TEXT = (
    "Category: cargo — statistics\nAnswer: Published vessel calls per year: 2023 222, 2024 333."
)


def chunk(kb_id: str = "kb-101", text: str = SOURCE_TEXT) -> RetrievedChunk:
    return RetrievedChunk(
        id=kb_id,
        text=text,
        score=0.9,
        metadata={
            "id": kb_id,
            "category": "cruise",
            "subcategory": "statistics",
            "source_url": f"https://example.invalid/{kb_id}",
            "source_type": "official-pdf",
            "as_of": "2026-06-01",
            "confidence": "confirmed",
        },
    )


def call_chart(**overrides):
    """Invoke make_chart with a valid grounded chart, overriding as needed."""
    payload = {
        "chart_type": "bar",
        "title": "Monthly cruise passengers",
        "x_label": "Month",
        "y_label": "Passengers",
        "series_name": "Cruise passengers",
        "x_values": ["January", "February", "March"],
        "y_values": [1111.0, 2222.0, 3333.0],
        "caption": "Illustrative sample figures, not official SCASPA statistics.",
        "source_kb_id": "kb-101",
    }
    payload.update(overrides)
    return make_chart.invoke(payload)


# ------------------------------------------------------------- POSITIVE CASE


def test_valid_grounded_chart_succeeds(tmp_settings) -> None:
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart()

        assert "Chart accepted" in result
        spec = context.chart
        assert spec is not None
        assert spec.type == "bar"
        assert spec.source == "kb-101"
        assert [p.y for p in spec.series[0].points] == [1111.0, 2222.0, 3333.0]
        assert [p.x for p in spec.series[0].points] == ["January", "February", "March"]


def test_spec_matches_the_frontend_contract_field_names() -> None:
    """The frontend types mirror these. Renaming one silently breaks rendering."""
    assert set(ChartSpec.model_fields) == {
        "type",
        "title",
        "x_label",
        "y_label",
        "series",
        "caption",
        "source",
    }
    assert set(ChartSeries.model_fields) == {"name", "points"}
    assert set(ChartPoint.model_fields) == {"x", "y"}


# ------------------------------------------------- NEGATIVE 1: unretrieved id


def test_chart_citing_an_unretrieved_id_fails(tmp_settings) -> None:
    """The agent must search before it charts."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk("kb-101")])

        result = call_chart(source_kb_id="kb-999")

        assert "Rejected" in result
        assert "not retrieved this turn" in result
        assert "Search first" in result
        assert context.chart is None, "no chart may be produced"


def test_chart_with_nothing_retrieved_fails(tmp_settings) -> None:
    with turn_context(settings=tmp_settings) as context:
        result = call_chart()

        assert "Rejected" in result
        assert "nothing yet" in result
        assert context.chart is None


# --------------------------------------------- NEGATIVE 2: number not in row


def test_chart_with_a_number_absent_from_the_source_row_fails(tmp_settings) -> None:
    """The dangerous case: a figure the knowledge base does not contain."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart(y_values=[1111.0, 2222.0, 9999.0])

        assert "Rejected" in result
        assert "9999" in result
        assert "only chart figures that are present" in result
        assert context.chart is None


def test_a_calculated_total_cannot_be_charted(tmp_settings) -> None:
    """1111 + 2222 = 3333 is arithmetic the row does not publish as a total."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk("kb-102", OFFICIAL_TEXT)])

        result = call_chart(
            source_kb_id="kb-102",
            x_values=["2023", "2024", "Total"],
            y_values=[222.0, 333.0, 555.0],
            caption="Published official figures.",
        )

        assert "Rejected" in result
        assert "555" in result
        assert context.chart is None


def test_a_rounded_figure_cannot_be_charted(tmp_settings) -> None:
    """Rounding is the quiet version of inventing."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk("kb-105", "Answer: 20 foot XCD 111.11, 40 foot XCD 222.22.")])

        result = call_chart(
            source_kb_id="kb-105",
            x_values=["20 foot", "40 foot"],
            y_values=[111.0, 222.0],
            caption="Illustrative sample tariffs.",
        )

        assert "Rejected" in result
        assert context.chart is None


def test_numeric_x_values_are_checked_too(tmp_settings) -> None:
    """A year on the x axis is a figure like any other."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk("kb-102", OFFICIAL_TEXT)])

        result = call_chart(
            source_kb_id="kb-102",
            x_values=["2023", "2024", "2099"],
            y_values=[222.0, 333.0, 222.0],
            caption="Published official figures.",
        )

        assert "Rejected" in result
        assert "2099" in result


def test_figures_present_in_the_row_are_accepted_in_any_written_form() -> None:
    """A real figure must not be rejected for its spelling.

    `12,407,059` and `12407059` are the same number, and refusing one would push
    the agent toward not charting at all.
    """
    text = "Answer: tonnage 12,407,059 and calls 333 and fare 44.44"

    assert figure_in_text(12407059, text)
    assert figure_in_text(333, text)
    assert figure_in_text(44.44, text)


def test_a_substring_is_not_a_match() -> None:
    """44 is a substring of 44.44 — accepting that would let a chart understate."""
    assert figure_in_text(44.44, "fare 44.44") is True
    assert figure_in_text(44, "fare 44.44") is False
    assert figure_in_text(11, "passengers 1111") is False


def test_number_forms_covers_separators_and_decimals() -> None:
    assert "1,111" in number_forms(1111)
    assert "1111" in number_forms(1111)
    assert "44.44" in number_forms(44.44)


# ------------------------------------------------- NEGATIVE 3: missing caption


def test_chart_with_no_caption_fails_validation() -> None:
    """A Pydantic validator, so it cannot be forgotten anywhere."""
    with pytest.raises(ValidationError):
        ChartSpec(
            type="bar",
            title="Passengers",
            x_label="Month",
            y_label="Passengers",
            series=[ChartSeries(name="s", points=[ChartPoint(x="Jan", y=1.0)])],
            caption="",
            source="kb-101",
        )


def test_caption_must_state_provenance() -> None:
    """ "Monthly passengers" says nothing about whether the numbers are real."""
    with pytest.raises(ValidationError, match="official"):
        ChartSpec(
            type="bar",
            title="Passengers",
            x_label="Month",
            y_label="Passengers",
            series=[ChartSeries(name="s", points=[ChartPoint(x="Jan", y=1.0)])],
            caption="Monthly passengers at Port Zante.",
            source="kb-101",
        )


def test_chart_without_a_caption_is_rejected_by_the_tool(tmp_settings) -> None:
    """And told the caption is *missing*, not told to reword it."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart(caption="")

        assert "Rejected" in result
        assert "caption is required" in result
        assert context.chart is None


def test_illustrative_source_requires_an_illustrative_caption(tmp_settings) -> None:
    """The row says SAMPLE DATA, so the chart may not claim to be official."""
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart(caption="Official published SCASPA passenger statistics.")

        assert "Rejected" in result
        assert "caption must say so" in result
        assert context.chart is None


def test_official_source_accepts_an_official_caption(tmp_settings) -> None:
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk("kb-102", OFFICIAL_TEXT)])

        result = call_chart(
            source_kb_id="kb-102",
            x_values=["2023", "2024"],
            y_values=[222.0, 333.0],
            caption="Official published figures from the annual report.",
        )

        assert "Chart accepted" in result
        assert context.chart is not None


# ------------------------------------------------------ NEGATIVE 4: shape caps


@pytest.mark.parametrize("bad_type", ["pie", "scatter", "donut", "radar", "3d-bar", ""])
def test_unsupported_chart_types_are_rejected(tmp_settings, bad_type: str) -> None:
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart(chart_type=bad_type)

        assert "Rejected" in result
        assert context.chart is None


@pytest.mark.parametrize("good_type", ["line", "bar", "area"])
def test_supported_chart_types_are_accepted(tmp_settings, good_type: str) -> None:
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        assert "Chart accepted" in call_chart(chart_type=good_type)


def test_too_many_points_is_rejected() -> None:
    """Beyond 40 it is unreadable on a phone, which is where the users are."""
    with pytest.raises(ValidationError):
        ChartSeries(
            name="s", points=[ChartPoint(x=str(i), y=float(i)) for i in range(MAX_POINTS + 1)]
        )


def test_too_many_series_is_rejected() -> None:
    series = ChartSeries(name="s", points=[ChartPoint(x="Jan", y=1.0)])
    with pytest.raises(ValidationError):
        ChartSpec(
            type="line",
            title="t",
            x_label="x",
            y_label="y",
            series=[series] * (MAX_SERIES + 1),
            caption="Illustrative sample figures.",
            source="kb-101",
        )


def test_mismatched_lengths_are_rejected(tmp_settings) -> None:
    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([chunk()])

        result = call_chart(x_values=["Jan", "Feb"], y_values=[1111.0])

        assert "Rejected" in result
        assert "one value per label" in result
        assert context.chart is None


# ------------------------------------------------------------- the invariant


def test_no_chart_survives_any_ungrounded_route(tmp_settings) -> None:
    """Sweep every rejection path and assert the turn holds no chart afterwards."""
    attempts = [
        {"source_kb_id": "kb-404"},
        {"y_values": [1.0, 2.0, 3.0]},
        {"caption": ""},
        {"caption": "Official SCASPA figures."},
        {"chart_type": "pie"},
        {"x_values": ["Jan"], "y_values": [1111.0, 2222.0]},
    ]
    for overrides in attempts:
        with turn_context(settings=tmp_settings) as context:
            context.record_chunks([chunk()])
            result = call_chart(**overrides)
            assert "Rejected" in result, overrides
            assert context.chart is None, overrides


# ------------------------------------------------- surfacing over HTTP (Task 5)

CHART_CSV = "sample_charts_kb.csv"


@pytest.fixture
def chart_api(tmp_settings, monkeypatch):
    """A client whose agent searches, charts, then answers."""
    from fastapi.testclient import TestClient

    from app.agent import graph as graph_module
    from app.config import get_settings
    from app.main import create_app
    from app.rag import answer as answer_module
    from app.rag.ingest import build_kb_index
    from app.rag.store import build_embeddings  # noqa: F401
    from tests.conftest import AxisEmbeddings
    from tests.scripted_model import says, scripted, tool_call

    csv_path = tmp_settings.kb_csv_path.parent / CHART_CSV
    embeddings = AxisEmbeddings()
    build_kb_index(
        csv_path=csv_path, settings=tmp_settings, embeddings=embeddings, echo=lambda _: None
    )

    model = scripted(
        tool_call("search_scaspa_knowledge", {"query": "cruise passengers by month"}, "c1"),
        tool_call(
            "make_chart",
            {
                "chart_type": "bar",
                "title": "Monthly cruise passengers",
                "x_label": "Month",
                "y_label": "Passengers",
                "series_name": "Cruise passengers",
                "x_values": ["January", "February", "March"],
                "y_values": [1111.0, 2222.0, 3333.0],
                "caption": "Illustrative sample figures, not official SCASPA statistics.",
                "source_kb_id": "kb-101",
            },
            "c2",
        ),
        says("Here is the illustrative monthly pattern [kb-101]."),
    )

    for module in (answer_module, graph_module):
        monkeypatch.setattr(module, "build_chat_model", lambda settings=None: model, raising=False)
    import app.rag.store as store_module

    monkeypatch.setattr(store_module, "build_embeddings", lambda settings=None: embeddings)

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: tmp_settings
    return TestClient(app)


def test_chart_appears_on_the_json_response(chart_api) -> None:
    body = chart_api.post("/api/chat", json={"message": "cruise passengers by month"}).json()

    chart = body["chart"]
    assert chart is not None
    assert chart["type"] == "bar"
    assert chart["x_label"] == "Month"
    assert chart["source"] == "kb-101"
    assert "illustrative" in chart["caption"].lower()
    assert [p["y"] for p in chart["series"][0]["points"]] == [1111.0, 2222.0, 3333.0]


def test_chart_event_arrives_before_done(chart_api) -> None:
    from tests.test_api_chat import read_events

    events = read_events(
        chart_api.post("/api/chat/stream", json={"message": "cruise passengers by month"})
    )
    names = [n for n, _ in events]

    assert "chart" in names
    assert names.index("chart") < names.index("done")
    assert names[-1] == "done"

    _, chart = next((n, d) for n, d in events if n == "chart")
    assert chart["source"] == "kb-101"
    assert chart["type"] == "bar"


def test_chart_is_absent_when_the_agent_does_not_chart(chart_api) -> None:
    """Most answers have no chart, and null must stay null.

    The scripted model here does chart, so a question that does not match the
    chart row still must not carry one over from anywhere else.
    """
    # A model that answers without charting.
    import app.agent.graph as graph_module
    import app.rag.answer as answer_module
    from tests.scripted_model import says, scripted

    plain = scripted(says("I do not have that."))
    for module in (answer_module, graph_module):
        module.build_chat_model = lambda settings=None: plain

    body = chart_api.post("/api/chat", json={"message": "cruise passengers by month"}).json()

    assert body["chart"] is None
