import json
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, Mock
from zipfile import ZipFile

import numpy as np
import pytest
import rasterio
from affine import Affine
from numpy.typing import NDArray
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.granules import EarthaccessGranuleReader, Granule
from itza_science.terrain.grid import Grid
from itza_science.terrain.sources import EarthdataSpatialSource, dem_tile, raster_values
from tests.spatial_support import proof

pytestmark = pytest.mark.unit
DAY = date(2025, 6, 1)


def write_raster(
    path: Path, grid: Grid, values: NDArray[Any], *, transform: Affine | None = None
) -> None:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=grid.width,
        height=grid.height,
        count=1,
        dtype=values.dtype,
        crs=grid.crs,
        transform=transform or grid.affine,
    ) as ds:
        ds.write(values, 1)


@pytest.fixture
def grid() -> Grid:
    return Grid.for_field(box(5.328, 36.118, 5.332, 36.122))


def test_raster_scaling_qa_and_alignment(tmp_path: Path, grid: Grid) -> None:
    path, qa = tmp_path / "ndvi.tif", tmp_path / "qa.tif"
    values = np.full(grid.shape, 5000, dtype=np.int16)
    values[0, 0] = -19999
    values[0, 1] = 11000
    flags = np.zeros(grid.shape, dtype=np.uint8)
    flags[1, 1] = 2
    write_raster(path, grid, values)
    write_raster(qa, grid, flags)
    result = raster_values(path, grid, ndvi=True, qa_path=qa)
    assert result[3, 3] == pytest.approx(0.5)
    assert np.isnan(result[0, 0])
    assert np.isnan(result[0, 1])
    assert np.isnan(result[1, 1])
    write_raster(
        qa, grid, flags, transform=Affine(30, 0, grid.affine.c + 30, 0, -30, grid.affine.f)
    )
    with pytest.raises(ValueError, match="QA"):
        raster_values(path, grid, ndvi=True, qa_path=qa)
    assert raster_values(path, grid)[3, 3] == 5000
    assert dem_tile(path, grid)[3, 3] == 5000


def test_native_hgt_zip(tmp_path: Path, grid: Grid) -> None:
    path = tmp_path / "dem.zip"
    with ZipFile(path, "w") as archive:
        archive.writestr("n36e005.hgt", np.full((1201, 1201), 950, dtype=">i2").tobytes())
    assert dem_tile(path, grid)[grid.mask].mean() == pytest.approx(950)
    with ZipFile(path, "w") as archive:
        archive.writestr("n36e005.hgt", b"bad dimensions")
    with pytest.raises(ValueError, match="dimensions"):
        dem_tile(path, grid)
    with ZipFile(path, "w") as archive:
        archive.writestr("unknown.hgt", b"bad")
    with pytest.raises(ValueError, match="name"):
        dem_tile(path, grid)


@pytest.mark.anyio
async def test_source_loads_dem_hls_and_coarse_moisture(tmp_path: Path, grid: Grid) -> None:
    dem, ndvi, qa = (tmp_path / name for name in ("dem.tif", "ndvi.tif", "qa.tif"))
    write_raster(dem, grid, np.full(grid.shape, 950.0, dtype=np.float64))
    write_raster(ndvi, grid, np.full(grid.shape, 5000, dtype=np.int16))
    write_raster(qa, grid, np.zeros(grid.shape, dtype=np.uint8))
    reader = EarthaccessGranuleReader(tmp_path)
    reader.credentials_available = Mock(return_value=True)  # type: ignore[method-assign]
    reader.search_period = AsyncMock(  # type: ignore[method-assign]
        side_effect=[[Granule(dem, DAY)], [Granule(ndvi, DAY, qa)], []]
    )
    source = EarthdataSpatialSource(reader, tmp_path)
    terrain = await source.dem(grid)
    assert terrain.elevation is not None
    assert terrain.dem_source is not None
    assert terrain.dem_source.product == "NASADEM_HGT"
    folder = tmp_path / "spatial" / "field" / "moisture"
    folder.mkdir(parents=True)
    write_raster(folder / "wet.tif", grid, np.full(grid.shape, 0.3))
    manifest = [
        {
            "file": "wet.tif",
            "date": DAY.isoformat(),
            "source": proof(DAY, "NISAR", 200).model_dump(mode="json"),
        }
    ]
    (folder / "manifest.json").write_text(json.dumps(manifest))
    inputs = await source.series(grid, Period(DAY, DAY), "field")
    assert len(inputs.observations) == 2
    assert inputs.observations[0].values[grid.mask].mean() == pytest.approx(0.5)
    assert inputs.observations[1].source.coarse
    assert inputs.observations[1].values[grid.mask].mean() == pytest.approx(0.3)
    reader.search_period = AsyncMock(return_value=[])  # type: ignore[method-assign]
    assert not (
        await source.series(grid, Period(date(2024, 1, 1), date(2024, 2, 1)), "field")
    ).observations
    (folder / "manifest.json").write_text('[{"file":"../unsafe.tif"}]')
    assert (await source.series(grid, Period(DAY, DAY), "field")).gaps


@pytest.mark.anyio
async def test_source_fallback_and_unavailable_granules(tmp_path: Path, grid: Grid) -> None:
    reader = EarthaccessGranuleReader(tmp_path)
    reader.credentials_available = Mock(return_value=False)  # type: ignore[method-assign]
    source = EarthdataSpatialSource(reader, tmp_path)
    assert (await source.dem(grid)).gaps
    assert (await source.series(grid, Period(DAY, DAY), "missing")).gaps
    reader.credentials_available = Mock(return_value=True)  # type: ignore[method-assign]
    reader.search_period = AsyncMock(side_effect=RuntimeError("private source error"))  # type: ignore[method-assign]
    result = await source.dem(grid)
    assert result.elevation is None
    assert "private" not in str(result.gaps)
    assert (await source.series(grid, Period(DAY, DAY), "missing")).gaps
    reader.search_period = AsyncMock(return_value=[Granule(tmp_path / "missing.tif", DAY)])  # type: ignore[method-assign]
    assert (await source.series(grid, Period(DAY, DAY), "missing")).gaps
    dem = tmp_path / "dem.tif"
    write_raster(dem, grid, np.full(grid.shape, 700.0))
    reader.search_period = AsyncMock(side_effect=[[], [Granule(dem, DAY)]])  # type: ignore[method-assign]
    fallback = await source.dem(grid)
    assert fallback.dem_source is not None
    assert fallback.dem_source.product == "SRTMGL1"
