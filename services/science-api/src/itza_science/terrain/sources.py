"""Live native rasters and optional precomputed, QA-masked NISAR moisture layers."""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Literal, Protocol
from zipfile import ZipFile

import numpy as np
import rasterio
from affine import Affine
from pydantic import Field
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window, from_bounds

from itza_science.adapters.base import Period
from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.field_bundle_schema import Gap
from itza_science.geo.qa import hls_fmask_invalid
from itza_science.terrain.grid import FloatArray, Grid
from itza_science.terrain.models import Model, Source


@dataclass
class Observation:
    day: date
    values: FloatArray
    source: Source
    variable: Literal["ndvi", "moisture"] = "ndvi"


@dataclass
class Inputs:
    observations: list[Observation] = field(default_factory=list)
    elevation: FloatArray | None = None
    dem_source: Source | None = None
    gaps: list[Gap] = field(default_factory=list)


class SpatialSource(Protocol):
    async def dem(self, grid: Grid) -> Inputs: ...
    async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs: ...


class CachedMoisture(Model):
    file: str = Field(pattern=r"^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.tif$")
    date: date
    source: Source


def gap(variable: str, reason: str) -> Gap:
    return Gap.model_validate({"var": variable, "reason": reason, "severity": "warning"})


def raster_values(
    path: Path, grid: Grid, *, ndvi: bool = False, qa_path: Path | None = None
) -> FloatArray:
    if ndvi and qa_path is None:
        raise ValueError("HLS NDVI requires a paired QA raster")
    with rasterio.open(path) as src:
        bounds = transform_bounds("EPSG:4326", src.crs, *grid.bounds)
        window = from_bounds(*bounds, transform=src.transform)
        col, row = int(np.floor(window.col_off)), int(np.floor(window.row_off))
        right = int(np.ceil(window.col_off + window.width))
        bottom = int(np.ceil(window.row_off + window.height))
        window = Window(col, row, right - col, bottom - row).intersection(
            Window(0, 0, src.width, src.height)
        )
        raw = src.read(1, window=window, masked=True)
        values = np.asarray(raw.astype(float).filled(np.nan))
        if ndvi:
            values[values == -19999] = np.nan
            scale = src.scales[0]
            if scale == 1 and np.issubdtype(raw.dtype, np.integer):
                scale = 0.0001
            values = values * scale + src.offsets[0]
            values[(values < -1) | (values > 1)] = np.nan
            if qa_path is not None:
                with rasterio.open(qa_path) as qa:
                    if qa.crs != src.crs or qa.transform != src.transform:
                        raise ValueError("HLS QA does not share the NDVI grid")
                    values[hls_fmask_invalid(qa.read(1, window=window))] = np.nan
        else:
            values = values * src.scales[0] + src.offsets[0]
        target = np.full(grid.shape, np.nan)
        reproject(
            values,
            target,
            src_transform=src.window_transform(window),
            src_crs=src.crs,
            dst_transform=grid.affine,
            dst_crs=grid.crs,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        return target


def dem_tile(path: Path, grid: Grid) -> FloatArray:
    if path.suffix.lower() != ".zip":
        return raster_values(path, grid)
    with ZipFile(path) as archive:
        member = next(n for n in archive.namelist() if n.lower().endswith(".hgt"))
        name = Path(member).name.lower()
        match = re.fullmatch(r"([ns])(\d{2})([ew])(\d{3})\.hgt", name)
        if match is None:
            raise ValueError("invalid NASADEM tile name")
        lat = int(match[2]) * (1 if match[1] == "n" else -1)
        lon = int(match[4]) * (1 if match[3] == "e" else -1)
        values = np.frombuffer(archive.read(member), dtype=">i2")
        size = int(np.sqrt(values.size))
        if size not in (1201, 3601) or size * size != values.size:
            raise ValueError("unexpected HGT dimensions")
        data = values.reshape(size, size).astype(float)
        data[data == -32768] = np.nan
        step = 1 / (size - 1)
        target = np.full(grid.shape, np.nan)
        reproject(
            data,
            target,
            src_transform=Affine(step, 0, lon - step / 2, 0, -step, lat + 1 + step / 2),
            src_crs="EPSG:4326",
            dst_transform=grid.affine,
            dst_crs=grid.crs,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        return target


class EarthdataSpatialSource:
    def __init__(self, reader: EarthaccessGranuleReader, data_dir: Path) -> None:
        self.reader = reader
        self.data_dir = data_dir

    async def dem(self, grid: Grid) -> Inputs:
        result = Inputs()
        if not self.reader.credentials_available():
            result.gaps.append(gap("elevation", "Earthdata credentials are not configured"))
            return result
        for product, version in (("NASADEM_HGT", "001"), ("SRTMGL1", "003")):
            try:
                granules = await self.reader.search_period(product, version, grid.bounds, None)
                merged = np.full(grid.shape, np.nan)
                for granule in granules:
                    layer = await asyncio.to_thread(dem_tile, granule.path, grid)
                    merged = np.where(np.isfinite(merged), merged, layer)
                if np.isfinite(merged[grid.mask]).any():
                    result.elevation = merged
                    result.dem_source = Source(
                        source=product.lower(),
                        product=product,
                        version=version,
                        resolution_m=30,
                        period=SourcePeriod(start=date(2000, 2, 11), end=date(2000, 2, 22)),
                        method="bilinear 30 m grid; SRTM acquisition; EGM96 orthometric height",
                    )
                    return result
            except Exception:
                result.gaps.append(gap("elevation", f"{product}: terrain source unavailable"))
        result.gaps.append(gap("elevation", "no valid DEM covers this field"))
        return result

    async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
        result = Inputs()
        if self.reader.credentials_available():
            for product in ("HLSL30_VI", "HLSS30_VI"):
                try:
                    granules = await self.reader.search_period(product, "2.0", grid.bounds, period)
                    for granule in granules:
                        if (len(result.observations) + 1) * grid.height * grid.width > 20000000:
                            raise ValueError("spatial observation budget exceeded")
                        try:
                            values = await asyncio.to_thread(
                                raster_values,
                                granule.path,
                                grid,
                                ndvi=True,
                                qa_path=granule.qa_path,
                            )
                            proof = Source(
                                source="hls_vi",
                                product=product,
                                version="2.0",
                                resolution_m=30,
                                period=SourcePeriod(start=granule.data_date, end=granule.data_date),
                                method=(
                                    "QA-masked NDVI; scale 0.0001; bilinear field-aligned 30 m grid"
                                ),
                            )
                            result.observations.append(
                                Observation(granule.data_date, values, proof)
                            )
                        except Exception:
                            result.gaps.append(
                                gap("ndvi", f"{product}: unreadable spatial granule")
                            )
                except Exception:
                    result.gaps.append(
                        gap("ndvi", f"{product}: source unavailable or range limit exceeded")
                    )
        else:
            result.gaps.append(gap("ndvi", "Earthdata credentials are not configured"))
        folder = self.data_dir / "spatial" / field_key / "moisture"
        try:
            records = json.loads((folder / "manifest.json").read_text())
            for record in records:
                item = CachedMoisture.model_validate(record)
                if not period.start <= item.date <= period.end:
                    continue
                if (len(result.observations) + 1) * grid.height * grid.width > 20000000:
                    raise ValueError("spatial observation budget exceeded")
                values = await asyncio.to_thread(raster_values, folder / item.file, grid)
                values[(values < 0) | (values > 1)] = np.nan
                proof = item.source.model_copy(update={"coarse": item.source.resolution_m > 30})
                result.observations.append(Observation(item.date, values, proof, "moisture"))
        except FileNotFoundError:
            result.gaps.append(gap("moisture", "no precomputed numeric NISAR moisture layer"))
        except Exception:
            result.gaps.append(gap("moisture", "invalid cached numeric moisture layer"))
        return result
