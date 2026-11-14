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
    with pytest.raises(ValueError, match="data length"):
        SubsetResponse.model_validate(
            {**grid, "subset": [{"calendar_date": "2025-01-01", "band": "NDVI", "data": [1]}]}
        )


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


def test_capture_applies_qa_and_records_prior_year_cropland_mask() -> None:
    from datetime import timedelta

    from capture import capture_site

    class FixtureArchive(Archive):
        def __init__(self) -> None:
            self.bad = False

        def subset(self, product: str, lat: float, lon: float, band: str) -> list[dict[str, Any]]:
            grid: dict[str, Any] = {
                "nrows": 1,
                "ncols": 1,
                "cellsize": 2,
                "xllcorner": 0,
                "yllcorner": 0,
            }
            if product == "MCD12Q1":
                return [{**grid, "subset": [{"calendar_date": "2024-01-01", "data": [12]}]}]
            return [
                {
                    **grid,
                    "subset": [
                        {
                            "calendar_date": f"2025-0{month}-01",
                            "data": [
                                month * 1000
                                if band.endswith("NDVI")
                                else int(self.bad and month == 1)
                            ],
                        }
                        for month in range(1, 7)
                    ],
                }
            ]

        def get(self, url: str, **params: str | float) -> dict[str, Any]:
            keys = [(date(2025, 1, 1) + timedelta(days=i)).strftime("%Y%m%d") for i in range(181)]
            return {
                "properties": {
                    "parameter": {
                        name: dict.fromkeys(keys, value)
                        for name, value in (("T2M_MIN", 10), ("T2M_MAX", 20), ("PRECTOTCORR", 1))
                    }
                }
            }

    archive = FixtureArchive()
    result = capture_site(archive, ("dz-high-plains", 35.72, 4.93))
    assert len(result) == 1
    assert result[0].land_cover_year == 2024
    assert result[0].peak_ndvi == pytest.approx(0.6)
    archive.bad = True
    assert capture_site(archive, ("dz-high-plains", 35.72, 4.93)) == []
