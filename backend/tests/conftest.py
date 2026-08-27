"""Shared fixtures.

Nothing here touches the OpenAI API. Embeddings are faked so the whole suite
runs in CI without a key.
"""

from pathlib import Path

import pytest
from langchain_core.embeddings import Embeddings

from app.config import Settings

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_CSV = REPO_ROOT / "data" / "knowledge" / "sample_kb.csv"


class AxisEmbeddings(Embeddings):
    """Deterministic fake embeddings with *meaningful* geometry.

    Each text is mapped to a unit vector on one axis by topic. Same topic means
    an identical vector (cosine distance 0); different topics mean orthogonal
    vectors (cosine distance 1). That makes score *direction* and the
    low-confidence short-circuit assertable without an embedding model.

    The off-topic axes matter as much as the on-topic ones: without a `beach`
    axis, "which beach should I visit?" collapsed onto the same catch-all axis
    as the contact row and scored a perfect 1.0. A fake this crude cannot say
    anything about real retrieval *quality* — it only exercises the mechanics.
    """

    # On-topic axes first, then off-topic ones a stress test will probe.
    _AXES = (
        "ferry",
        "cargo",
        "cruise",
        "airport",
        "contact",
        "beach",
        "hotel",
        "restaurant",
        "duty",
        "radio",
    )

    def _vector(self, text: str) -> list[float]:
        lowered = text.lower()
        vector = [0.0] * (len(self._AXES) + 1)
        for i, axis in enumerate(self._AXES):
            if axis in lowered:
                vector[i] = 1.0
                return vector
        vector[-1] = 1.0
        return vector

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


@pytest.fixture
def fake_embeddings() -> AxisEmbeddings:
    return AxisEmbeddings()


@pytest.fixture
def sample_csv() -> Path:
    """The committed fixture CSV. Obviously-fake values only — CLAUDE.md rule 5."""
    return SAMPLE_CSV


@pytest.fixture
def tmp_settings(tmp_path: Path) -> Settings:
    """Settings pointing at a throwaway data directory.

    `_env_file=None` so a developer's local .env cannot influence a test run.
    """
    return Settings(
        _env_file=None,
        CHROMA_DIR=str(tmp_path / "chroma"),
        # SCRAPED_DIR must be isolated too. It defaults to ../data/scraped, and
        # without this the scraper and TTS-cache tests wrote into the real data
        # directory — a test fixture silently overwrote the committed
        # flagged_for_client.md with one row of fake content, and the TTS cache
        # leaked between tests so a "first" request reported a cache hit.
        SCRAPED_DIR=str(tmp_path / "scraped"),
        # Same lesson as SCRAPED_DIR: an un-isolated path writes to the real data
        # directory. The question log would otherwise accumulate test questions.
        QUESTION_LOG_PATH=str(tmp_path / "questions.jsonl"),
        KB_CSV_PATH=str(SAMPLE_CSV),
    )


@pytest.fixture(autouse=True, scope="session")
def _no_watchtower_in_tests():
    """No test run may reach SCASPA's servers.

    ── THREE LAYERS, AND THIS IS THE ONE THAT MATTERS ───────────────────────

    `WATCHTOWER_ENABLED` defaults to True so that a real deployment schedules
    without anyone remembering a flag. That is the right default for production
    and exactly the wrong one here, so it is switched off for the whole session
    before any `Settings` object is built.

    Two other things happen to protect us today and neither is load-bearing:
    `TestClient(app)` outside a `with` block does not run the lifespan at all,
    and the scheduler waits a minute before its first sweep. Both are properties
    of how the tests are written now — one `with TestClient(app) as client` and
    a slow suite would be enough to start fetching a live schedule from CI.

    `os.environ` rather than a Settings override, because `get_settings()` is
    `lru_cache`d and `create_app()` calls it directly.
    """
    import os

    from app.config import get_settings

    previous = os.environ.get("WATCHTOWER_ENABLED")
    os.environ["WATCHTOWER_ENABLED"] = "false"
    get_settings.cache_clear()
    yield
    if previous is None:
        os.environ.pop("WATCHTOWER_ENABLED", None)
    else:
        os.environ["WATCHTOWER_ENABLED"] = previous
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _isolate_process_state():
    """Reset the process-wide limiter and spend tracker between tests.

    Both are deliberately module-level singletons in production. Without this,
    one test's requests count against the next test's rate limit and the suite
    fails in whatever order happens to exhaust the budget first.
    """
    from app.costs import reset_spend_tracker
    from app.ratelimit import reset_rate_limiter

    reset_rate_limiter()
    reset_spend_tracker()
    yield
    reset_rate_limiter()
    reset_spend_tracker()
