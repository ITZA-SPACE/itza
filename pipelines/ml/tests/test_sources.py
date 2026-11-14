from datetime import date
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from capture import Archive, SubsetResponse, center, hargreaves
from enrich import anomaly, awc

pytestmark = pytest.mark.unit


def test_public_response_cache_and_retry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def get(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(kwargs)
        return httpx.Response(
            503 if len(calls) == 1 else 200, json={"value": 16}, request=httpx.Request("GET", url)
        )

    monkeypatch.setattr(httpx, "get", get)
    monkeypatch.setattr("capture.time.sleep", lambda _: None)
    archive = Archive(tmp_path)
    assert archive.get("https://example.test/data", latitude=36.12) == {"value": 16}
    assert archive.get("https://example.test/data", latitude=36.12) == {"value": 16}
    assert len(calls) == 2
    archive.pool.shutdown()


def test_modis_grid_center_uses_north_to_south_row_order() -> None:
    grid = {"xllcorner": 10, "yllcorner": 20, "cellsize": 2, "ncols": 2, "nrows": 2}
    assert center(grid, 0) == (11, 23)
    assert center(grid, 3) == (13, 21)
    with pytest.raises(ValueError):
        SubsetResponse.model_validate({**grid, "cellsize": -1, "subset": []})


def test_hargreaves_matches_independent_fao_example() -> None:
    # FAO-56 extraterrestrial radiation example: 3 September, latitude 20 S, Ra ≈ 32.2 MJ/m²/day.
    # https://www.fao.org/4/X0490E/x0490e07.htm (Example 8).
    # Eq. 52 with Tmin=20, Tmax=30 gives about 4.09 mm/day.
    assert hargreaves(date(2001, 9, 3), -20, 20, 30) == pytest.approx(4.09, abs=0.01)
    assert hargreaves(date(2001, 9, 3), 20, 20, 20) == 0


def test_rootzone_anomalies_are_standardized() -> None:
    observed = {year: 0.2 + 0.01 * (year - 2016) for year in range(2016, 2026)}
    values = list(anomaly(observed).values())
    assert np.mean(values) == pytest.approx(0, abs=1e-10)
    assert np.std(values) == pytest.approx(1)
    assert anomaly({2016: 0.2}) == {}
    assert anomaly(dict.fromkeys(range(2016, 2026), 0.2)) == {}


def test_awc_depth_weighting_and_missing_cells(tmp_path: Path) -> None:
    paths = []
    for name, value in (("field", 300), ("wilting", 100)):
        path = tmp_path / f"{name}.tif"
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            height=2,
            width=2,
            count=1,
            dtype="int16",
            crs="EPSG:4326",
            transform=from_origin(0, 2, 1, 1),
            nodata=-32768,
        ) as dst:
            dst.write(np.array([[value, -32768], [value, value]], dtype="int16"), 1)
        paths.append(path)
    assert awc([(paths[0], 1, 1), (paths[1], 1, -1)], 1.5, 0.5) == 200
    assert awc([(paths[0], 1, 1)], 1.5, 1.5) is None
