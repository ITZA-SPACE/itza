"""Builds tiny synthetic granule fixtures for the science-api adapter tests.

SYNTHETIC DATA: invented numbers shaped like the real NASA products, not real
observations. Covers the semi-arid-winter-cereal field from
fixtures/synthetic/generate.mjs (centroid 5.33, 36.12; ~12.4 ha). Run with:

    cd services/science-api && uv run python ../../fixtures/granules/generate.py

Deterministic: same output on every run.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
import xarray as xr
from rasterio.transform import from_origin

HERE = Path(__file__).resolve().parent

# Field bbox (matches fixtures/synthetic/generate.mjs squareField(centroid=[5.33, 36.12], 12.4ha))
FIELD_WEST, FIELD_EAST = 5.32804, 5.33196
FIELD_SOUTH, FIELD_NORTH = 36.11842, 36.12158


def _write_imerg(path: Path, precip_mm: float) -> None:
    """3x3 cells at 0.1 degree (~11 km), the field sits inside the center cell."""
    lon = np.array([5.25, 5.35, 5.45])
    lat = np.array([36.05, 36.15, 36.25])  # ascending; adapter flips to north-up
    data = np.full((3, 3), precip_mm, dtype="f4")
    ds = xr.Dataset(
        {"precipitation": (("lat", "lon"), data)},
        coords={"lat": lat, "lon": lon},
    )
    ds.to_netcdf(path, engine="h5netcdf")


def _write_smap(path: Path, surface: float, rootzone: float) -> None:
    """3x3 cells at 0.09 degree (~9 km), 8 three-hourly steps for one day."""
    lon = np.array([5.24, 5.33, 5.42])
    lat = np.array([36.03, 36.12, 36.21])  # ascending
    time = np.arange(8)
    rng = np.random.default_rng(seed=42)
    surface_data = (surface + rng.normal(0, 0.01, size=(8, 3, 3))).astype("f4")
    rootzone_data = (rootzone + rng.normal(0, 0.005, size=(8, 3, 3))).astype("f4")
    ds = xr.Dataset(
        {
            "sm_surface": (("time", "lat", "lon"), surface_data),
            "sm_rootzone": (("time", "lat", "lon"), rootzone_data),
        },
        coords={"time": time, "lat": lat, "lon": lon},
    )
    ds.to_netcdf(path, engine="h5netcdf")


def _write_hls(path: Path, ndvi: float, cloud_fraction: float) -> None:
    """16x16 pixels at 30 m covering the field with a margin; two bands: NDVI, Fmask."""
    size = 16
    pixel_deg = 0.00033  # ~37 m, close enough for a synthetic fixture
    west = FIELD_WEST - 2 * pixel_deg
    north = FIELD_NORTH + 2 * pixel_deg
    transform = from_origin(west, north, pixel_deg, pixel_deg)
    rng = np.random.default_rng(seed=7)
    ndvi_band = np.full((size, size), ndvi, dtype="f4") + rng.normal(0, 0.01, size=(size, size))
    fmask_band = np.zeros((size, size), dtype="u1")
    n_cloudy = int(size * size * cloud_fraction)
    if n_cloudy:
        flat_idx = rng.choice(size * size, size=n_cloudy, replace=False)
        fmask_band.flat[flat_idx] = 0b0000_0010  # cloud bit
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=size,
        width=size,
        count=2,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        dst.write(ndvi_band.astype("f4"), 1)
        dst.write(fmask_band.astype("f4"), 2)


def main() -> None:
    _write_imerg(HERE / "imerg_final_clear.nc", precip_mm=4.2)
    _write_imerg(HERE / "imerg_late_clear.nc", precip_mm=3.8)
    _write_smap(HERE / "smap_l4_clear.nc", surface=0.22, rootzone=0.28)
    _write_hls(HERE / "hls_vi_clear.tif", ndvi=0.62, cloud_fraction=0.0)
    _write_hls(HERE / "hls_vi_partly_cloudy.tif", ndvi=0.55, cloud_fraction=0.6)
    print("wrote granule fixtures to", HERE)


if __name__ == "__main__":
    main()
