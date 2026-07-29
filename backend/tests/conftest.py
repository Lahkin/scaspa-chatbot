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
        KB_CSV_PATH=str(SAMPLE_CSV),
    )
