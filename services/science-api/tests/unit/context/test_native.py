from datetime import date
from io import BytesIO
from pathlib import Path

import h5py
import numpy as np
import pytest
import xarray as xr
from PIL import Image
from shapely.geometry import box

from itza_science.context.gedi import read_gedi
from itza_science.context.grace import read_grace, trend
from itza_science.context.models import BoxQuery, MonthlyValue, SceneQuery
from itza_science.context.rasters import NISAR_ROOT, ecostress, nisar
from tests.context_support import BOUNDS, FIXTURES

pytestmark = pytest.mark.unit


def test_nisar_native_clipping_flags_and_image() -> None:
    field = box(*BOUNDS)
    raster = nisar(FIXTURES / "nisar.h5", field)
    assert raster is not None
    assert raster.grid.crs == "EPSG:6933"
    assert raster.grid.dlon == 200
    assert raster.flags["retrieval_nonzero"] == 1
    assert raster.flags["precipitation"] == 1
    summary = raster.stats(field, "m3/m3")
    assert summary is not None
    stats, quality = summary
    assert 0.1 <= stats.mean <= 0.4
    assert 0 < stats.coverage < 1
    assert quality.valid_pixels == 2
    image, bounds = raster.image(field, "moisture")
    assert len(image) <= 150000
    assert Image.open(BytesIO(image)).mode == "RGBA"
    np.testing.assert_allclose(bounds, BOUNDS)
    assert nisar(FIXTURES / "nisar.h5", box(6, 35, 6.001, 35.001)) is None


def test_nisar_fill_and_coordinate_order(tmp_path: Path) -> None:
    path = tmp_path / "flipped.h5"
    with h5py.File(FIXTURES / "nisar.h5") as src, h5py.File(path, "w") as dst:
        src.copy("science", dst)
    with h5py.File(path, "a") as file:
        group = file[NISAR_ROOT]
        group["xCoordinates"][:] = group["xCoordinates"][:][::-1]
        group["yCoordinates"][:] = group["yCoordinates"][:][::-1]
        for name in ("soilMoisture", "retrievalQualityFlag", "ancillaryData/surfaceQualityFlag"):
            group[name][:] = group[name][:][::-1, ::-1]
    expected = nisar(FIXTURES / "nisar.h5", box(*BOUNDS))
    actual = nisar(path, box(*BOUNDS))
    assert expected is not None
    assert actual is not None
    np.testing.assert_allclose(actual.values, expected.values)
    np.testing.assert_array_equal(actual.invalid, expected.invalid)
    with h5py.File(path, "a") as file:
        file[NISAR_ROOT + "/soilMoisture"][:] = -9999
    missing = nisar(path, box(*BOUNDS))
    assert missing is not None
    assert missing.stats(box(*BOUNDS), "m3/m3") is None


def test_grace_gain_units_missing_months_and_trend(tmp_path: Path) -> None:
    series = read_grace(FIXTURES / "grace.nc", 36.12, 5.33)
    assert len(series) == 36
    assert series[5].anomaly_cm is None
    assert series[17].anomaly_cm is None
    assert trend(series) == pytest.approx(4)
    with xr.open_dataset(FIXTURES / "grace.nc", engine="h5netcdf") as src:
        dataset = src.load()
    dataset["lwe_thickness"] /= 100
    dataset["lwe_thickness"].attrs["units"] = "m"
    dataset.to_netcdf(tmp_path / "meters.nc", engine="h5netcdf")
    assert [p.anomaly_cm for p in read_grace(tmp_path / "meters.nc", 36.12, 5.33)] == pytest.approx(
        [p.anomaly_cm for p in series]
    )
    dataset["land_mask"][:] = 0
    dataset.to_netcdf(tmp_path / "water.nc", engine="h5netcdf")
    assert read_grace(tmp_path / "water.nc", 36.12, 5.33) == []
    dataset["land_mask"][:] = 1
    dataset["lwe_thickness"].attrs["units"] = "unknown"
    dataset.to_netcdf(tmp_path / "units.nc", engine="h5netcdf")
    with pytest.raises(ValueError, match="unit"):
        read_grace(tmp_path / "units.nc", 36.12, 5.33)


@pytest.mark.parametrize("seed", range(10))
def test_trend_is_invariant_to_vertical_offset_and_preserves_sign(seed: int) -> None:
    rng = np.random.default_rng(seed)
    dates = [date(year, month, 1) for year in (2023, 2024, 2025) for month in range(1, 13)]
    slope = float(rng.uniform(-10, 10))
    values = [slope * (day - dates[0]).days / 365.2425 for day in dates]
    series = [MonthlyValue(date=d, anomaly_cm=v) for d, v in zip(dates, values, strict=True)]
    shifted = [MonthlyValue(date=p.date, anomaly_cm=float(p.anomaly_cm or 0) + 500) for p in series]
    assert trend(series) == pytest.approx(slope)
    assert trend(shifted) == pytest.approx(slope)
    assert trend(list(reversed(series))) == pytest.approx(slope)
    assert trend(series[:12]) is None


@pytest.mark.parametrize("product", ["GEDI02_A", "GEDI02_B"])
def test_gedi_quality_distance_and_native_groups(product: str) -> None:
    points, truncated = read_gedi(
        FIXTURES / ("gedi_a.h5" if product.endswith("A") else "gedi_b.h5"), box(*BOUNDS), product
    )
    assert len(points) == 3
    assert not truncated
    assert sum(p.properties.on_field for p in points) == 2
    assert all(p.properties.date == date(2025, 6, 1) for p in points)
    assert all(len(p.properties.shot_number) == 17 for p in points)
    if product.endswith("A"):
        assert {p.properties.height_m for p in points} == {10.0}
    else:
        assert {p.properties.cover_fraction for p in points} == {0.6}
    assert not read_gedi(FIXTURES / "gedi_a.h5", box(7, 35, 7.001, 35.001), "GEDI02_A")[0]


@pytest.mark.parametrize("variable", ["lst", "esi"])
def test_ecostress_native_cogs_cloud_water_and_qc(variable: str) -> None:
    assets = {p.name: p for p in FIXTURES.glob("*.tif")}
    raster = ecostress(assets, box(*BOUNDS), variable)
    assert raster is not None
    summary = raster.stats(box(*BOUNDS), "K" if variable == "lst" else "1")
    assert summary is not None
    stats, quality = summary
    assert stats.mean == pytest.approx(300 if variable == "lst" else 0.6)
    assert quality.flags["cloud"] == 1
    assert quality.flags["water"] == 1
    if variable == "lst":
        assert quality.flags["mandatory_qc_nonzero"] == 1
    assert ecostress(assets, box(7, 35, 7.001, 35.001), variable) is None


@pytest.mark.parametrize("value", ["5,36,4,37", "nan,36,5,37", "5,36,5,37", "5,36,6", "1,1,100,50"])
def test_box_validation(value: str) -> None:
    with pytest.raises(ValueError, match="bbox"):
        BoxQuery(bbox=value)


def test_reversed_dates_are_rejected() -> None:
    with pytest.raises(ValueError, match="ordered"):
        SceneQuery.model_validate(
            {"bbox": ",".join(map(str, BOUNDS)), "from": "2026-09-01", "to": "2026-08-01"}
        )
