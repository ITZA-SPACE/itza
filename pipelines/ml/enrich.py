"""Add measured SMAP, SoilGrids AWC and NASADEM slope; cache and report source gaps."""

import argparse
import asyncio
import gzip
import json
from pathlib import Path

import httpx
import numpy as np
import rasterio
import xarray as xr
from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.core.config import Settings
from itza_science.terrain.derivatives import derive
from itza_science.terrain.grid import Grid
from itza_science.terrain.sources import EarthdataSpatialSource
from numpy.typing import NDArray
from pyproj import Transformer
from shapely.geometry import box

from capture import SITES
from data import PixelSeason

SMAP = "https://nasa-power-smap.s3.amazonaws.com/smap/temporal/power_smap_daily_temporal_utc.zarr"
DEPTHS = (("0-5cm", 0.05), ("5-15cm", 0.1), ("15-30cm", 0.15), ("30-60cm", 0.3), ("60-100cm", 0.4))


def moisture(cache: Path, lat: float, lon: float) -> dict[int, float]:
    path = cache / f"smap-{lat}-{lon}.json"
    if path.exists():
        return {int(k): float(v) for k, v in json.loads(path.read_text()).items()}
    with xr.open_zarr(SMAP, consolidated=True, chunks=None) as dataset:
        series = (
            dataset.RZMC.sel(lat=lat, lon=lon, method="nearest")
            .sel(time=slice("2015-01-01", "2025-12-31"))
            .load()
        )
    annual = {}
    for year in range(2015, 2026):
        season = series.sel(time=slice(f"{year}-01-01", f"{year}-06-30"))
        # 2015 is deliberately missing: the mission began during that season.
        if season.size >= 181 and np.isfinite(season.values).mean() >= 0.9:
            annual[year] = float(season.mean(skipna=True))
    path.write_text(json.dumps(annual))
    return annual


def anomaly(values: dict[int, float]) -> dict[int, float]:
    """Fixed retrospective 2016–2025 seasonal climatology, not an in-season forecast."""
    if len(values) < 5 or np.std(list(values.values())) < 1e-6:
        return {}
    mean, std = np.mean(list(values.values())), np.std(list(values.values()))
    return {year: float((value - mean) / std) for year, value in values.items()}


def soil(cache: Path, lat: float, lon: float) -> list[tuple[Path, float, float]]:
    layers = []
    for depth, weight in DEPTHS:
        for name, sign in (("wv0033", 1.0), ("wv1500", -1.0)):
            path = cache / f"{name}-{depth}-{lat}-{lon}.tif"
            if not path.exists():
                response = httpx.get(
                    "https://maps.isric.org/mapserv",
                    params={
                        "map": f"/map/{name}.map",
                        "SERVICE": "WCS",
                        "VERSION": "1.0.0",
                        "REQUEST": "GetCoverage",
                        "COVERAGE": f"{name}_{depth}_mean",
                        "FORMAT": "GEOTIFF_INT16",
                        "CRS": "EPSG:4326",
                        "BBOX": f"{lon - 0.02},{lat - 0.02},{lon + 0.02},{lat + 0.02}",
                        "WIDTH": "16",
                        "HEIGHT": "16",
                    },
                    timeout=120,
                )
                response.raise_for_status()
                # Validate the response before caching it (WCS may return an XML error with 200).
                with rasterio.MemoryFile(response.content) as memory, memory.open():
                    pass
                path.write_bytes(response.content)
            layers.append((path, weight, sign))
    return layers


def awc(layers: list[tuple[Path, float, float]], lat: float, lon: float) -> float | None:
    value = 0.0
    for path, weight, sign in layers:
        with rasterio.open(path) as raster:
            sample = next(raster.sample([(lon, lat)], masked=True))[0]
            if np.ma.is_masked(sample) or not 0 <= float(sample) <= 1000:
                return None
            # SoilGrids water contents are volumetric per mille; difference = mm per m.
            value += float(sample) * weight * sign
    return value if 0 < value <= 1000 else None


async def terrain(cache: Path, lat: float, lon: float) -> tuple[Grid, NDArray[np.float64]]:
    grid = Grid.for_field(box(lon - 0.02, lat - 0.02, lon + 0.02, lat + 0.02))
    path = cache / f"slope-{lat}-{lon}.npy"
    if path.exists():
        return grid, np.asarray(np.load(path, allow_pickle=False), dtype=float)
    settings = Settings(_env_file=Path(__file__).resolve().parents[2] / "services/science-api/.env")
    reader = EarthaccessGranuleReader(
        cache / "granules",
        credentials={
            key: value.get_secret_value()
            for key, value in (
                ("EARTHDATA_TOKEN", settings.earthdata_token),
                ("EARTHDATA_USERNAME", settings.earthdata_username),
                ("EARTHDATA_PASSWORD", settings.earthdata_password),
            )
            if value is not None
        },
    )
    inputs = await EarthdataSpatialSource(reader, cache).dem(grid)
    if inputs.elevation is None:
        raise ValueError("No NASADEM/SRTM elevation available")
    slope = derive(inputs.elevation).slope
    np.save(path, slope, allow_pickle=False)
    (cache / f"slope-{lat}-{lon}-source.json").write_text(
        inputs.dem_source.model_dump_json() if inputs.dem_source else "{}"
    )
    return grid, slope


async def enrich(rows: list[PixelSeason], cache: Path) -> list[PixelSeason]:
    known = {f"{region}:{lat}:{lon}" for region, lat, lon in SITES}
    if any(row.block not in known for row in rows):
        raise ValueError("dataset contains an unknown sampling block")
    cache.mkdir(parents=True, exist_ok=True)
    result = []
    gaps = []
    for region, lat, lon in SITES:
        block = f"{region}:{lat}:{lon}"
        print(f"Enriching {block}", flush=True)
        # Independent sources fail independently; no invented defaults.
        smap: dict[int, float] = {}
        layers = []
        terrain_data = None
        try:
            smap = anomaly(moisture(cache, lat, lon))
        except (OSError, ValueError, httpx.HTTPError) as exc:
            gaps.append({"block": block, "source": "SMAP", "reason": type(exc).__name__})
        try:
            layers = soil(cache, lat, lon)
        except (OSError, ValueError, httpx.HTTPError) as exc:
            gaps.append({"block": block, "source": "SoilGrids", "reason": type(exc).__name__})
        try:
            terrain_data = await terrain(cache, lat, lon)
        except (OSError, ValueError, httpx.HTTPError) as exc:
            gaps.append({"block": block, "source": "NASADEM", "reason": type(exc).__name__})
        static: dict[str, tuple[float | None, float | None]] = {}
        for row in rows:
            if row.block != block:
                continue
            if row.pixel not in static:
                pixel_lat, pixel_lon = map(float, row.pixel.split(","))
                slope = None
                if terrain_data is not None:
                    grid, values = terrain_data
                    x, y = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True).transform(
                        pixel_lon, pixel_lat
                    )
                    col, line = ~grid.affine * (x, y)
                    if 0 <= int(line) < grid.height and 0 <= int(col) < grid.width:
                        value = float(values[int(line), int(col)])
                        slope = value if np.isfinite(value) else None
                static[row.pixel] = (awc(layers, pixel_lat, pixel_lon) if layers else None, slope)
            water, slope = static[row.pixel]
            features = row.features.model_copy(
                update={
                    "smap_rootzone_anomaly": smap.get(row.year),
                    "soil_awc_mm_m": water,
                    "slope_deg": slope,
                }
            )
            result.append(row.model_copy(update={"features": features}))
    (cache / "gaps.json").write_text(json.dumps(gaps, indent=2))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows = [PixelSeason.model_validate_json(line) for line in args.dataset.read_text().splitlines()]
    rows = asyncio.run(enrich(rows, args.cache))
    encoded = ("\n".join(row.model_dump_json() for row in rows) + "\n").encode()
    args.output.write_bytes(gzip.compress(encoded, mtime=0))


if __name__ == "__main__":
    main()
