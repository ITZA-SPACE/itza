from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from itza_science import __version__
from itza_science.adapters.dataset_store import StoreGranuleReader
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


def test_dataset_store_is_used_only_when_the_directory_exists(tmp_path: Path) -> None:
    def readers(settings: Settings) -> tuple[object, object]:
        with TestClient(create_app(settings)) as client:
            imerg, smap = client.app.state.bundle_adapters[:2]  # type: ignore[attr-defined]
            return imerg._reader, smap._reader

    assert not any(isinstance(r, StoreGranuleReader) for r in readers(Settings()))
    missing = Settings(dataset_store_dir=tmp_path / "nowhere")
    assert not any(isinstance(r, StoreGranuleReader) for r in readers(missing))
    assert all(
        isinstance(r, StoreGranuleReader) for r in readers(Settings(dataset_store_dir=tmp_path))
    )
