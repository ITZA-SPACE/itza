import json
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from itza_science.core.config import Settings
from tests.support import load_fixture

pytestmark = pytest.mark.integration

POWER_URL = "https://power.larc.nasa.gov/api/projection/monthly/point"
AKRON = {"lat": 40.15, "lon": -103.15}


def _write_baseline(data_dir: Path, lat: str, lon: str, *, with_future: bool = False) -> None:
    folder = data_dir / "baselines" / "projection"
    folder.mkdir(parents=True, exist_ok=True)
    model: dict[str, object] = {
        "baseline": {
            "tmax": [0.0] * 12,
            "tmin": [0.0] * 12,
            "tmean": [0.0] * 12,
            "precip": [2.0] * 12,
        }
    }
    if with_future:
        model["future"] = {
            "ssp245": {
                "tmax": [1.0] * 12,
                "tmin": [1.0] * 12,
                "tmean": [1.0] * 12,
                "precip": [2.2] * 12,
            }
        }
    record = {
        "version": "archive-2026-11",
        "cell_lat": float(lat),
        "cell_lon": float(lon),
        "models": {"gfdl_esm4": model},
    }
    (folder / f"{lat}_{lon}.json").write_text(json.dumps(record))


def _mock_power(status: int = 200, body: dict[str, object] | None = None) -> None:
    respx.get(POWER_URL).mock(return_value=httpx.Response(status, json=body or {}))


@respx.mock
def test_power_path_returns_median_min_max_with_provenance(
    settings: Settings, client: TestClient
) -> None:
    _write_baseline(settings.data_dir, "40.125", "-103.125")
    _mock_power(200, load_fixture("projection_akron_2041_gfdl_esm4.json"))

    response = client.get("/v1/projection", params=AKRON)

    assert response.status_code == 200
    body = response.json()
    assert body["provenance"]["path"] == "power"
    assert body["provenance"]["baseline_period"] == "1995-2014"
    assert body["provenance"]["future_period"] == "2041-2060"
    tmax = body["scenarios"]["ssp245"]["tmax"]
    assert tmax["models"] == 1
    assert len(tmax["median"]) == 12
    assert tmax["median"] == tmax["min"] == tmax["max"]


@respx.mock
def test_single_ssp_query_param_is_honored(settings: Settings, client: TestClient) -> None:
    _write_baseline(settings.data_dir, "40.125", "-103.125")
    _mock_power(200, load_fixture("projection_akron_2041_gfdl_esm4.json"))

    response = client.get("/v1/projection", params={**AKRON, "ssp": "ssp245"})

    assert response.status_code == 200
    assert list(response.json()["scenarios"]) == ["ssp245"]


@respx.mock
def test_power_empty_falls_back_to_archive_future(settings: Settings, client: TestClient) -> None:
    _write_baseline(settings.data_dir, "36.125", "5.375", with_future=True)
    _mock_power(200, load_fixture("projection_setif_2041_empty.json"))

    response = client.get("/v1/projection", params={"lat": 36.19, "lon": 5.41})

    assert response.status_code == 200
    body = response.json()
    assert body["provenance"]["path"] == "archive"
    assert body["provenance"]["source_version"] == "archive-2026-11"


@respx.mock
def test_missing_baseline_is_a_gap_style_502(settings: Settings, client: TestClient) -> None:
    response = client.get("/v1/projection", params=AKRON)

    assert response.status_code == 502
    assert response.json()["gaps"][0]["var"] == "nex_gddp_baseline"


@respx.mock
def test_upstream_failure_is_a_gap_style_502(settings: Settings, client: TestClient) -> None:
    _write_baseline(settings.data_dir, "40.125", "-103.125")
    _mock_power(500)

    response = client.get("/v1/projection", params=AKRON)

    assert response.status_code == 502
    assert response.json()["gaps"][0]["severity"] == "error"


def test_invalid_latitude_is_422(client: TestClient) -> None:
    response = client.get("/v1/projection", params={"lat": 91, "lon": 0})
    assert response.status_code == 422


def test_invalid_ssp_is_422(client: TestClient) -> None:
    response = client.get("/v1/projection", params={"lat": 0, "lon": 0, "ssp": "ssp999"})
    assert response.status_code == 422


@respx.mock
def test_repeated_request_is_served_from_cache(settings: Settings, client: TestClient) -> None:
    _write_baseline(settings.data_dir, "40.125", "-103.125")
    route = _mock_power_route(load_fixture("projection_akron_2041_gfdl_esm4.json"))

    first = client.get("/v1/projection", params=AKRON)
    second = client.get("/v1/projection", params=AKRON)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert route.call_count == 6  # one call per model, not doubled by the second request


def _mock_power_route(body: dict[str, object]) -> respx.Route:
    return respx.get(POWER_URL).mock(return_value=httpx.Response(200, json=body))
