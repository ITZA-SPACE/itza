from hashlib import sha256
from pathlib import Path

import pytest
import rasterio
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.prithvi_support import fixture_publication

pytestmark = pytest.mark.integration


def test_fixture_raster_and_provenance(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.prithvi_directory = tmp_path
    manifest = fixture_publication(tmp_path)
    response = client.get("/v1/prithvi/fixture-field")
    assert response.status_code == 200
    assert response.json() == manifest.model_dump(mode="json")
    raster = client.get("/v1/prithvi/fixture-field/rasters/2022")
    assert raster.status_code == 200
    assert raster.headers["etag"] == f'"{manifest.seasons[0].sha256}"'
    with rasterio.MemoryFile(raster.content) as memory, memory.open() as src:
        assert src.read(1).tolist() == [[0, 1], [2, 1]]
        assert src.res == (30, 30)


@pytest.mark.parametrize("path", ["unknown", "unknown/rasters/2022"])
def test_missing_publication(client: TestClient, tmp_path: Path, path: str) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.prithvi_directory = tmp_path
    assert client.get(f"/v1/prithvi/{path}").status_code == 404


@pytest.mark.parametrize("suffix", ["", "/rasters/2022"])
def test_invalid_id(client: TestClient, suffix: str) -> None:
    assert client.get(f"/v1/prithvi/UPPER_CASE{suffix}").status_code == 422


def test_missing_season(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.prithvi_directory = tmp_path
    fixture_publication(tmp_path)
    assert client.get("/v1/prithvi/fixture-field/rasters/2023").status_code == 404


@pytest.mark.parametrize(
    "case", ["checksum", "large", "missing", "invalid_tiff", "classes", "symlink"]
)
def test_invalid_raster(client: TestClient, tmp_path: Path, case: str) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.prithvi_directory = tmp_path
    manifest = fixture_publication(tmp_path)
    directory = tmp_path / "fixture-field"
    path = directory / "prithvi-2022.tif"
    if case == "missing":
        path.unlink()
    elif case == "symlink":
        other = tmp_path / "outside.tif"
        path.rename(other)
        path.symlink_to(other)
    else:
        if case == "classes":
            with rasterio.open(path, "r+") as dst:
                values = dst.read(1)
                values[0, 0] = 99
                dst.write(values, 1)
        else:
            path.write_bytes(b"broken" * (30_000 if case == "large" else 1))
        if case != "checksum":
            manifest.seasons[0].sha256 = sha256(path.read_bytes()).hexdigest()
            (directory / "prithvi.json").write_text(manifest.model_dump_json())
    assert client.get("/v1/prithvi/fixture-field/rasters/2022").status_code == 503


@pytest.mark.parametrize("case", ["json", "large", "id", "symlink"])
def test_invalid_manifest(client: TestClient, tmp_path: Path, case: str) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.prithvi_directory = tmp_path
    manifest = fixture_publication(tmp_path)
    path = tmp_path / "fixture-field" / "prithvi.json"
    if case == "id":
        manifest.bundle_id = "different"
        path.write_text(manifest.model_dump_json())
    elif case == "symlink":
        other = tmp_path / "outside.json"
        path.rename(other)
        path.symlink_to(other)
    else:
        path.write_bytes(b"x" * (100_001 if case == "large" else 1))
    assert client.get("/v1/prithvi/fixture-field").status_code == 503


def test_symlink_directory_cannot_escape(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    root = tmp_path / "root"
    root.mkdir()
    fixture_publication(tmp_path)
    (root / "fixture-field").symlink_to(tmp_path / "fixture-field")
    client.app.state.prithvi_directory = root
    assert client.get("/v1/prithvi/fixture-field").status_code == 404
