import pytest
from fastapi.testclient import TestClient

from itza_science import __version__
from itza_science.core.config import Settings
from itza_science.main import create_app

pytestmark = pytest.mark.integration


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "science-api", "version": __version__}


def test_cors_allows_configured_origin_only(client: TestClient) -> None:
    allowed = client.get("/health", headers={"Origin": "http://allowed.test"})
    blocked = client.get("/health", headers={"Origin": "http://evil.test"})
    assert allowed.headers["access-control-allow-origin"] == "http://allowed.test"
    assert "access-control-allow-origin" not in blocked.headers


def test_openapi_hidden_in_production() -> None:
    with TestClient(create_app(Settings(environment="production"))) as prod:
        assert prod.get("/openapi.json").status_code == 404
        assert prod.get("/docs").status_code == 404


def test_openapi_lists_health_route(client: TestClient) -> None:
    assert "/health" in client.get("/openapi.json").json()["paths"]
