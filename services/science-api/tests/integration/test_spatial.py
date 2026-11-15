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
from itza_science.terrain.relief import ReliefGrid
from itza_science.terrain.service import ReliefSources, SpatialService, fit_jpeg
from tests.integration.test_bundles import FIELD, PERIOD, _install_fixture_adapters
from tests.spatial_support import FixtureReliefSource, FixtureSpatialSource

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


def install_relief(
    client: TestClient, tmp_path: Path, primary: FixtureReliefSource, mosaic: FixtureReliefSource
) -> str:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(
        tmp_path, FixtureSpatialSource(), ReliefSources(primary, mosaic)
    )
    _install_fixture_adapters(client)
    period = {"start": "2025-01-01", "end": "2026-01-02"}
    created = client.post("/v1/bundles", json={"geometry": FIELD, "period": period}).json()
    assert client.get(f"/v1/bundles/{created['id']}").json()["status"] == "done"
    return str(created["id"])


def test_terrain_index_lists_relief(client: TestClient, tmp_path: Path) -> None:
    primary = FixtureReliefSource()
    bundle_id = install_relief(client, tmp_path, primary, FixtureReliefSource())
    # Building the bundle reads the 30 m terrain only: the fine surface waits for the twin.
    assert primary.calls == 0
    terrain = client.get(f"/v1/bundles/{bundle_id}/terrain").json()
    Draft202012Validator(TerrainIndex.model_json_schema()).validate(terrain)
    relief = terrain["relief"]
    grid = ReliefGrid.for_field(shape(FIELD))
    assert (relief["width"], relief["height"]) == (grid.width, grid.height)
    assert relief["bounds"] == pytest.approx(list(grid.bounds))
    assert relief["size_m"] == pytest.approx(list(grid.size_m))
    assert (relief["min_elevation_m"], relief["max_elevation_m"]) == (1000, 1010)
    assert relief["elevation_source"]["product"] == "synthetic-lidar"
    assert relief["imagery_source"]["product"] == "synthetic-aerial"
    heightmap = client.get(relief["heightmap"])
    assert heightmap.headers["content-type"] == "image/png"
    assert "immutable" in heightmap.headers["cache-control"]
    image = Image.open(BytesIO(heightmap.content))
    assert (image.mode, image.size) == ("RGB", (grid.width, grid.height))
    rgb = np.asarray(image).astype(float)
    decoded = 1000 + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * 10
    assert decoded[0, 5] == pytest.approx(1010, abs=0.001)
    assert decoded[-1, 5] == pytest.approx(1000, abs=0.001)
    assert client.get(relief["imagery"]).headers["content-type"] == "image/jpeg"
    assert any(g["var"] == "elevation" and "filled" in g["reason"] for g in terrain["gaps"])
    assert client.get(f"/v1/bundles/{bundle_id}/terrain").json() == terrain
    assert primary.calls == 1
    assert client.get(f"/v1/bundles/{bundle_id}/terrain/" + "a" * 64 + ".jpg").status_code == 404


def test_terrain_relief_falls_back_and_notes_it(client: TestClient, tmp_path: Path) -> None:
    bundle_id = install_relief(
        client,
        tmp_path,
        FixtureReliefSource(elevation=False, imagery=False),
        FixtureReliefSource(imagery=False),
    )
    terrain = client.get(f"/v1/bundles/{bundle_id}/terrain").json()
    relief = terrain["relief"]
    assert relief["elevation_source"]["product"] == "synthetic-DEM"
    assert relief["elevation_source"]["coarse"] is True
    assert relief["imagery"] is None
    assert relief["imagery_source"] is None
    assert {g["var"] for g in terrain["gaps"]} >= {"elevation", "imagery"}


def test_terrain_survives_relief_failure(client: TestClient, tmp_path: Path) -> None:
    primary = FixtureReliefSource(fail=True)
    bundle_id = install_relief(client, tmp_path, primary, FixtureReliefSource())
    for _ in range(2):
        response = client.get(f"/v1/bundles/{bundle_id}/terrain")
        assert response.status_code == 200
        terrain = response.json()
        assert terrain["available"]
        assert terrain["layers"]
        assert terrain["relief"] is None
        assert any(g["var"] == "relief" and g["severity"] == "warning" for g in terrain["gaps"])
    # A failure is not cached: the next request tries the source again.
    assert primary.calls == 2


def test_terrain_without_relief_sources_is_unchanged(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    period = {"start": "2025-01-01", "end": "2026-01-02"}
    bundle_id = client.post("/v1/bundles", json={"geometry": FIELD, "period": period}).json()["id"]
    terrain = client.get(f"/v1/bundles/{bundle_id}/terrain").json()
    assert terrain["relief"] is None
    assert not any(g["var"] == "relief" for g in terrain["gaps"])


def test_fit_jpeg_shrinks_or_gives_up() -> None:
    noise = np.random.default_rng(3).integers(0, 255, (256, 256, 3), dtype=np.uint8)
    out = BytesIO()
    Image.fromarray(noise, "RGB").save(out, "JPEG", quality=98)
    original = out.getvalue()
    assert fit_jpeg(original, len(original)) == original
    smaller = fit_jpeg(original, len(original) // 2)
    assert smaller is not None
    assert len(smaller) <= len(original) // 2
    assert Image.open(BytesIO(smaller)).size == (256, 256)
    assert fit_jpeg(original, 100) is None


def test_relief_from_an_outline_without_a_bundle(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    primary = FixtureReliefSource()
    client.app.state.spatial = SpatialService(
        tmp_path, FixtureSpatialSource(), ReliefSources(primary, FixtureReliefSource())
    )
    response = client.post("/v1/relief", json={"geometry": FIELD})
    assert response.status_code == 200, response.text
    body = response.json()
    relief = body["relief"]
    grid = ReliefGrid.for_field(shape(FIELD))
    assert (relief["width"], relief["height"]) == (grid.width, grid.height)
    assert relief["heightmap"].startswith("/v1/relief/")
    heightmap = client.get(relief["heightmap"])
    assert heightmap.headers["content-type"] == "image/png"
    assert "immutable" in heightmap.headers["cache-control"]
    assert Image.open(BytesIO(heightmap.content)).size == (grid.width, grid.height)
    assert client.get(relief["imagery"]).headers["content-type"] == "image/jpeg"
    assert any(g["var"] == "elevation" for g in body["gaps"])
    # The second request for the same outline is served from the cache.
    assert client.post("/v1/relief", json={"geometry": FIELD}).json() == body
    assert primary.calls == 1
    key = relief["heightmap"].split("/")[3]
    assert client.get(f"/v1/relief/{key}/" + "a" * 64 + ".png").status_code == 404
    assert client.get(f"/v1/relief/{key}/bad.png").status_code == 422


def test_relief_endpoint_reports_no_source_and_rejects_bad_input(
    client: TestClient, tmp_path: Path
) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(tmp_path, FixtureSpatialSource())
    body = client.post("/v1/relief", json={"geometry": FIELD}).json()
    assert body == {"relief": None, "gaps": []}
    assert client.post("/v1/relief", json={"geometry": FIELD, "extra": 1}).status_code == 422
    polar = {
        "type": "Polygon",
        "coordinates": [[[10, 88], [10.01, 88], [10.01, 88.01], [10, 88.01], [10, 88]]],
    }
    client.app.state.spatial = SpatialService(
        tmp_path,
        FixtureSpatialSource(),
        ReliefSources(FixtureReliefSource(), FixtureReliefSource()),
    )
    response = client.post("/v1/relief", json={"geometry": polar})
    assert response.status_code == 200
    assert response.json()["relief"] is None
