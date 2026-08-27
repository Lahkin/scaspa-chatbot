"""Published answers served as a page, and the rule that governs them.

`GET /api/guide` puts knowledge-base rows on a screen instead of in a sentence.
That is a genuinely new exposure: everything the assistant says passes a
grounding gate and arrives with a citation the backend verified, and none of
that machinery is in the path here — the rows go straight to the client.

So the guard is the selection, and there is exactly one rule doing the work:
**only `confidence == "confirmed"` rows leave this endpoint.** Most of this file
is about that rule holding, including in the ways it would plausibly be relaxed.
"""

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.ops import guide

HEADER = (
    "id,category,subcategory,question,answer,keywords,audience,source_url,"
    "source_type,as_of,volatility,confidence,notes"
)


def _row(
    row_id: str,
    *,
    category: str = "airport",
    subcategory: str = "facilities",
    confidence: str = "confirmed",
    as_of: str = "2026-07-31",
    volatility: str = "low",
    answer: str = "Placeholder answer for a test.",
) -> str:
    return (
        f"{row_id},{category},{subcategory},A test question?,{answer},kw,all,"
        f"https://www.scaspa.com/test.html,official-site,{as_of},{volatility},{confidence},"
    )


@pytest.fixture
def kb(tmp_path: Path):  # noqa: ANN201
    """Build a throwaway export and point Settings at it."""

    def build(*rows: str) -> Settings:
        path = tmp_path / "kb.csv"
        path.write_text("\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
        # The service caches on (path, mtime); a fresh tmp path per test is
        # enough, but clearing keeps a same-second rewrite honest.
        guide._confirmed_rows.cache_clear()
        return Settings(_env_file=None, KB_CSV_PATH=str(path))

    return build


class TestOnlyConfirmedRowsReachAScreen:
    """Rule 8, applied to a page rather than to the index.

    A page is not a lower standard than a sentence. If anything it is a higher
    one: a screen is scanned and believed without the reader ever forming a
    question they might have doubted the answer to. There is no "ask a follow-up"
    moment in which an unverified claim gets challenged.
    """

    @pytest.mark.parametrize("confidence", ["probable", "unverified"])
    def test_unconfirmed_rows_are_withheld(self, kb, confidence: str) -> None:  # noqa: ANN001
        settings = kb(_row("kb-001", confidence=confidence))
        result = guide.topics("airport", settings)

        assert result.total == 0
        assert result.topics == []

    def test_confirmed_rows_are_served(self, kb) -> None:  # noqa: ANN001
        settings = kb(_row("kb-001"))
        assert guide.topics("airport", settings).total == 1

    def test_a_mixed_export_serves_only_the_confirmed_half(self, kb) -> None:  # noqa: ANN001
        # The realistic shape: the live export is 116 confirmed out of 232.
        settings = kb(
            _row("kb-001"),
            _row("kb-002", confidence="probable"),
            _row("kb-003"),
            _row("kb-004", confidence="unverified"),
        )
        result = guide.topics("airport", settings)

        assert result.total == 2
        served = {e.id for t in result.topics for e in t.entries}
        assert served == {"kb-001", "kb-003"}


class TestNothingIsInvented:
    def test_every_field_is_copied_from_the_export(self, kb) -> None:  # noqa: ANN001
        """The answer, the source and the date are the researchers', verbatim.

        This is the assertion that would fail the day somebody "improves" an
        answer in code — truncating it, appending a disclaimer, defaulting a
        missing source to scaspa.com. Each of those produces text on screen that
        no researcher wrote and none can correct.
        """
        settings = kb(_row("kb-001", answer="Exactly these words.", as_of="2025-01-02"))
        [entry] = guide.topics("airport", settings).topics[0].entries

        assert entry.answer == "Exactly these words."
        assert entry.source_url == "https://www.scaspa.com/test.html"
        assert entry.as_of == date(2025, 1, 2)
        # The same anchor the assistant cites, so a reader meeting an answer in
        # both places is looking at one row rather than two agreeing sources.
        assert entry.id == "kb-001"

    def test_volatility_survives_the_trip(self, kb) -> None:  # noqa: ANN001
        # "Rarely changes" and "check before use" lead to different actions, and
        # only one of them is a question this product can settle.
        settings = kb(_row("kb-001", volatility="high"))
        [entry] = guide.topics("airport", settings).topics[0].entries
        assert entry.volatility == "high"


class TestProvenance:
    def test_the_page_date_is_the_oldest_verification(self, kb) -> None:  # noqa: ANN001
        """The only date true of everything on the screen.

        Stamping the newest would advertise the best case: a page whose oldest
        answer was checked two years ago would carry last month's date.
        """
        settings = kb(
            _row("kb-001", as_of="2026-07-31"),
            _row("kb-002", as_of="2024-05-09"),
            _row("kb-003", as_of="2025-11-02"),
        )
        source = guide.topics("airport", settings).source

        assert source.kind == "published"
        assert source.as_of is not None
        assert source.as_of.date() == date(2024, 5, 9)

    def test_an_empty_category_is_unavailable_not_an_empty_published_set(self, kb) -> None:  # noqa: ANN001
        """ "We have verified nothing" and "SCASPA publishes nothing" differ.

        Only the first is a statement about this product, and `published` with
        zero entries would quietly make it the second — while also being a
        source with no `as_of`, which the schema refuses outright.
        """
        settings = kb(_row("kb-001", category="cruise"))
        source = guide.topics("airport", settings).source

        assert source.kind == "unavailable"
        assert source.notice


class TestGrouping:
    def test_rows_are_grouped_by_the_researchers_subcategory(self, kb) -> None:  # noqa: ANN001
        settings = kb(
            _row("kb-001", subcategory="parking"),
            _row("kb-002", subcategory="facilities"),
            _row("kb-003", subcategory="parking"),
        )
        result = guide.topics("airport", settings)

        assert {t.name: len(t.entries) for t in result.topics} == {"parking": 2, "facilities": 1}

    def test_a_row_with_no_subcategory_lands_in_general(self, kb) -> None:  # noqa: ANN001
        # "general" is the one string this service contributes, and it names a
        # grouping rather than asserting anything about SCASPA.
        settings = kb(_row("kb-001", subcategory=""))
        assert guide.topics("airport", settings).topics[0].name == "general"


class TestTheEndpoint:
    """Through the router, with `with TestClient(...)` — which runs the lifespan.

    Worth saying out loud: this is the exact shape `tests/conftest.py` warns
    about in `_no_watchtower_in_tests`. A lifespan that starts the source
    monitor would begin fetching SCASPA's live endpoint from CI, and the only
    thing stopping it is that fixture. These tests are the reason it is not
    theoretical.
    """

    @pytest.fixture
    def client(self, kb, monkeypatch):  # noqa: ANN001, ANN201
        """A client whose guide service reads a throwaway export.

        `monkeypatch` rather than a hand-rolled try/finally: it restores even
        when an assertion raises, and a leaked `get_settings` would silently
        point every later test in the session at one temp directory.
        """

        def build(*rows: str):  # noqa: ANN202
            settings = kb(*rows)
            monkeypatch.setattr(guide, "get_settings", lambda: settings)
            guide._confirmed_rows.cache_clear()
            return TestClient(create_app())

        return build

    def test_it_serves_confirmed_rows_with_their_provenance(self, client) -> None:  # noqa: ANN001
        with client(_row("kb-001"), _row("kb-002", confidence="probable")) as http:
            response = http.get("/api/guide", params={"category": "airport"})

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["source"]["kind"] == "published"
        assert body["source"]["as_of"] is not None

    def test_an_unknown_category_is_an_answer_not_a_404(self, client) -> None:  # noqa: ANN001
        """ "Nothing verified about this" is information, and 200 is how it is said.

        A 404 would mean the endpoint does not exist, and the client would show
        an error where the correct screen is an honest empty state.
        """
        with client(_row("kb-001")) as http:
            response = http.get("/api/guide", params={"category": "nonsense"})

        assert response.status_code == 200
        assert response.json()["total"] == 0
        assert response.json()["source"]["kind"] == "unavailable"


def test_a_replaced_export_is_picked_up_without_a_restart(tmp_path: Path) -> None:
    """The cache key carries the file's mtime, and this is why.

    A researcher correcting a wrong answer and redeploying the CSV must not be
    outlived by a parse cached at boot. Caching on the path alone would serve
    the superseded answer until someone restarted the process — and nobody would
    know to.
    """
    path = tmp_path / "kb.csv"
    settings = Settings(_env_file=None, KB_CSV_PATH=str(path))

    path.write_text("\n".join([HEADER, _row("kb-001", answer="First answer.")]) + "\n", "utf-8")
    guide._confirmed_rows.cache_clear()
    assert guide.topics("airport", settings).topics[0].entries[0].answer == "First answer."

    # Rewritten with a different mtime, exactly as a redeploy would.
    import os

    path.write_text("\n".join([HEADER, _row("kb-001", answer="Corrected answer.")]) + "\n", "utf-8")
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 10))

    assert guide.topics("airport", settings).topics[0].entries[0].answer == "Corrected answer."
