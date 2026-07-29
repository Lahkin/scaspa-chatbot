"""Health endpoint tests.

These run without an OPENAI_API_KEY — nothing here touches the OpenAI API.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import REQUEST_ID_HEADER, create_app
from app.rag.ingest import build_kb_index


@pytest.fixture
def client(tmp_settings) -> TestClient:
    """A client whose settings point at an empty throwaway data directory."""
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: tmp_settings
    return TestClient(app)


def test_health_stamps_a_request_id(client: TestClient) -> None:
    response = client.get("/api/health")

    request_id = response.headers[REQUEST_ID_HEADER]
    assert request_id
    assert response.json()["request_id"] == request_id


def test_incoming_request_id_is_preserved(client: TestClient) -> None:
    response = client.get("/api/health", headers={REQUEST_ID_HEADER: "test-request-id"})

    assert response.headers[REQUEST_ID_HEADER] == "test-request-id"
    assert response.json()["request_id"] == "test-request-id"


def test_missing_index_meta_is_degraded_not_an_error(client: TestClient) -> None:
    """A fresh checkout has no index. That is reported, not raised."""
    response = client.get("/api/health")

    assert response.status_code == 200, "a missing index must never be a 500"
    body = response.json()
    assert body["status"] == "degraded"
    assert body["index"]["ready"] is False
    assert "build_index" in body["index"]["message"]
    # Unknown must not masquerade as zero.
    assert body["index"]["kb_rows"] is None
    assert body["index"]["kb_updated_at"] is None
    assert body["index"]["index_built_at"] is None


def test_health_reflects_a_real_index(
    client: TestClient, tmp_settings, sample_csv, fake_embeddings
) -> None:
    build_kb_index(
        csv_path=sample_csv,
        settings=tmp_settings,
        embeddings=fake_embeddings,
        echo=lambda _: None,
    )

    body = client.get("/api/health").json()

    assert body["status"] == "ok"
    assert body["index"]["ready"] is True
    assert body["index"]["kb_rows"] == 10
    assert body["index"]["kb_updated_at"] == "2026-06-01"
    assert body["index"]["index_built_at"] is not None
    assert body["index"]["kb_csv_filename"] == "sample_kb.csv"
    assert body["index"]["embedding_model"] == tmp_settings.OPENAI_EMBEDDING_MODEL


def test_openapi_schema_renders(client: TestClient) -> None:
    """/docs cannot render if the OpenAPI schema fails to build."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/health" in response.json()["paths"]
