from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from PIL import Image
from rasterio.io import MemoryFile
from shapely.geometry import shape

from itza_science.terrain.models import FrameIndex, TerrainIndex, ZoneCollection
from itza_science.terrain.service import SpatialService
from tests.integration.test_bundles import FIELD, PERIOD, _install_fixture_adapters
from tests.spatial_support import FixtureSpatialSource

pytestmark = pytest.mark.integration


def install(client: TestClient, tmp_path: Path) -> FixtureSpatialSource:
    assert isinstance(client.app, FastAPI)
    source = FixtureSpatialSource()
    client.app.state.spatial = SpatialService(tmp_path, source)
    _install_fixture_adapters(client)
    return source


def test_zones_geojson_clipped_stable_and_scenario(client: TestClient, tmp_path: Path) -> None:
    source = install(client, tmp_path)
    body = {
        "geometry": FIELD,
        "period": {"start": "2024-01-01", "end": "2026-12-31"},
        "soil": {"awc_mm_per_m": 140, "curve_number": 75, "source": "caller field estimate"},
    }
    response = client.post("/v1/zones", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    Draft202012Validator(ZoneCollection.model_json_schema()).validate(result)
    assert result["enabled"]
    assert 2 <= result["k"] <= 4
    assert result["stability"] > 0.8
    for feature in result["features"]:
        geometry = shape(feature["geometry"])
        assert geometry.is_valid
        assert not geometry.is_empty
        assert geometry.difference(shape(FIELD).buffer(1e-10)).area < 1e-12
        props = feature["properties"]
        assert props["soil_water"]["awc_mm_per_m"] == 140
        assert props["soil_water"]["confidence"] == "low"
        assert any("coarser" in note for note in props["notes"])
        assert 0 <= props["stability"] <= 1
    assert any(p["coarse"] and p["resolution_m"] == 200 for p in result["provenance"])
    count = source.calls
    assert client.post("/v1/zones", json=body).json() == result
    assert source.calls == count
    assert client.post("/v1/zones", json={**body, "refresh": True}).status_code == 200
    assert source.calls > count


def test_small_and_invalid_fields(client: TestClient, tmp_path: Path) -> None:
    source = install(client, tmp_path)
    tiny = {
        "type": "Polygon",
        "coordinates": [[[5, 36], [5.0001, 36], [5.0001, 36.0001], [5, 36.0001], [5, 36]]],
    }
    response = client.post("/v1/zones", json={"geometry": tiny, "period": PERIOD})
    assert response.status_code == 200
    assert not response.json()["enabled"]
    assert "3 hectares" in response.json()["reason"]
    assert source.calls == 0
    assert (
        client.post(
            "/v1/zones", json={"geometry": FIELD, "period": PERIOD, "soil": {"awc_mm_per_m": 0}}
        ).status_code
        == 422
    )


def test_bundle_terrain_and_dated_frames(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    period = {"start": "2025-01-01", "end": "2026-01-02"}
    bundle_id = client.post("/v1/bundles", json={"geometry": FIELD, "period": period}).json()["id"]
    status = client.get(f"/v1/bundles/{bundle_id}").json()
    assert status["status"] == "done", status
    elevation = client.get(f"/v1/bundles/{bundle_id}/series/elevation").json()
    assert elevation["cadence"] == "static"
    assert elevation["values"][0] > 0
    assert "metric gradients" in elevation["provenance"]["method"]
    terrain_response = client.get(f"/v1/bundles/{bundle_id}/terrain")
    assert terrain_response.status_code == 200
    terrain = terrain_response.json()
    Draft202012Validator(TerrainIndex.model_json_schema()).validate(terrain)
    assert terrain["available"]
    assert terrain["mean_slope_deg"] == pytest.approx(np.degrees(np.arctan(0.1)))
    for variable, href in terrain["layers"].items():
        response = client.get(href)
        assert response.status_code == 200, (variable, href)
        if variable.endswith("_png"):
            assert len(response.content) <= 150000
            assert Image.open(BytesIO(response.content)).mode == "RGBA"
            continue
        with MemoryFile(response.content) as memory, memory.open() as dataset:
            assert dataset.res == (30, 30)
            assert dataset.count == 1
            assert np.isnan(dataset.read(1)[0, 0])
    assert client.get(f"/v1/bundles/{bundle_id}/terrain").json() == terrain
    url = f"/v1/bundles/{bundle_id}/frames"
    index = client.get(url).json()
    Draft202012Validator(FrameIndex.model_json_schema()).validate(index)
    assert len(index["frames"]) == 4
    assert {f["variable"] for f in index["frames"]} == {"ndvi", "moisture"}
    for frame in index["frames"]:
        response = client.get(frame["href"])
        assert response.status_code == 200
        assert len(response.content) == frame["bytes"] <= 150000
        assert Image.open(BytesIO(response.content)).size == (frame["width"], frame["height"])
    assert client.get(url + "/index.json").json() == index
    assert client.get(url, params={"refresh": True}).status_code == 200
    assert client.get(url + "/" + "a" * 64 + ".png").status_code == 404
    assert client.get(f"/v1/bundles/{bundle_id}/terrain/" + "a" * 64 + ".tif").status_code == 404
    assert client.get(url + "/bad.png").status_code == 422


@pytest.mark.parametrize(
    "suffix", ["terrain", "frames", "terrain/" + "a" * 64 + ".tif", "frames/" + "a" * 64 + ".png"]
)
def test_missing_bundle(client: TestClient, suffix: str) -> None:
    assert client.get("/v1/bundles/" + "a" * 64 + "/" + suffix).status_code == 404


def test_missing_sources_are_explicit(client: TestClient) -> None:
    result = client.post("/v1/zones", json={"geometry": FIELD, "period": PERIOD}).json()
    assert not result["enabled"]
    assert result["gaps"]
    bundle = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD}).json()["id"]
    assert not client.get(f"/v1/bundles/{bundle}/terrain").json()["available"]
    assert not client.get(f"/v1/bundles/{bundle}/frames").json()["frames"]
