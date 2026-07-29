"""Health endpoint tests.

These run without an OPENAI_API_KEY — nothing here touches the OpenAI API.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import REQUEST_ID_HEADER, create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_health_returns_200_and_schema(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert body["index"]["ready"] is False


def test_health_stamps_a_request_id(client: TestClient) -> None:
    response = client.get("/api/health")

    request_id = response.headers[REQUEST_ID_HEADER]
    assert request_id
    assert response.json()["request_id"] == request_id


def test_incoming_request_id_is_preserved(client: TestClient) -> None:
    response = client.get("/api/health", headers={REQUEST_ID_HEADER: "test-request-id"})

    assert response.headers[REQUEST_ID_HEADER] == "test-request-id"
    assert response.json()["request_id"] == "test-request-id"


def test_openapi_schema_renders(client: TestClient) -> None:
    """/docs cannot render if the OpenAPI schema fails to build."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/health" in response.json()["paths"]
