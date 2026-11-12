"""Windowed native raster decoding, conservative QA and field-overlap statistics."""

from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np
import rasterio
from affine import Affine
from numpy.typing import NDArray
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds as geographic_transform
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window, from_bounds
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from itza_science.context.models import Quality, Stats
from itza_science.geo.clip import Grid, area_weighted_mean
from itza_science.terrain.grid import FloatArray, project
from itza_science.terrain.grid import Grid as DisplayGrid
from itza_science.terrain.images import encode

NISAR_ROOT = "science/LSAR/SME2/grids"
NISAR_POLICY = (
    "Only retrievalQualityFlag=0 and surfaceQualityFlag=0; "
    "fill/nonfinite/out-of-range values excluded."
)


@dataclass
class Raster:
    grid: Grid
    values: FloatArray
    invalid: NDArray[np.bool_]
    flags: dict[str, int]
    policy: str

    def stats(self, field: BaseGeometry, unit: str) -> tuple[Stats, Quality] | None:
        result = area_weighted_mean(self.grid, self.values, self.invalid, field)
        if result.mean is None:
            return None
        intersecting = geometry_mask(
            [mapping(project(field, "EPSG:4326", self.grid.crs))],
            out_shape=self.values.shape,
            transform=Affine(
                self.grid.dlon, 0, self.grid.lon_min, 0, -self.grid.dlat, self.grid.lat_max
            ),
            all_touched=True,
            invert=True,
        )
        valid = ~self.invalid & np.isfinite(self.values) & intersecting
        return (
            Stats(
                mean=result.mean,
                minimum=float(self.values[valid].min()),
                maximum=float(self.values[valid].max()),
                unit=unit,
                coverage=result.coverage,
            ),
            Quality(
                policy=self.policy,
                flags=self.flags,
                valid_pixels=int(valid.sum()),
                total_pixels=int(self.values.size),
            ),
        )

    def image(
        self, field: BaseGeometry, variable: str
    ) -> tuple[bytes, tuple[float, float, float, float]]:
        west, south, east, north = field.bounds
        width, height = 256, max(2, min(1024, round(256 * (north - south) / (east - west))))
        affine = geographic_transform(west, south, east, north, width, height)
        display = DisplayGrid("EPSG:4326", affine, height, width, field)
        values = np.full((height, width), np.nan)
        reproject(
            np.where(self.invalid, np.nan, self.values),
            values,
            src_transform=Affine(
                self.grid.dlon, 0, self.grid.lon_min, 0, -self.grid.dlat, self.grid.lat_max
            ),
            src_crs=self.grid.crs,
            dst_transform=affine,
            dst_crs="EPSG:4326",
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )
        payload, _, _, bounds = encode(values, display, variable)
        return payload, bounds


def _h5_values(dataset: h5py.Dataset, rows: slice, cols: slice) -> FloatArray:
    values = np.asarray(dataset[rows, cols], dtype=np.float64)
    fill = dataset.attrs.get("_FillValue")
    if fill is not None:
        values[values == float(fill)] = np.nan
    return values * float(dataset.attrs.get("scale_factor", 1)) + float(
        dataset.attrs.get("add_offset", 0)
    )


def nisar(path: Path, field: BaseGeometry) -> Raster | None:
    with h5py.File(path, "r") as file:
        group = file[NISAR_ROOT]
        xs = np.asarray(group["xCoordinates"][:], dtype=float)
        ys = np.asarray(group["yCoordinates"][:], dtype=float)
        crs = f"EPSG:{int(group['projection'][()])}"
        dx, dy = abs(float(xs[1] - xs[0])), abs(float(ys[1] - ys[0]))
        west, south, east, north = project(field, "EPSG:4326", crs).bounds
        xi = np.flatnonzero((xs + dx / 2 > west) & (xs - dx / 2 < east))
        yi = np.flatnonzero((ys + dy / 2 > south) & (ys - dy / 2 < north))
        if not xi.size or not yi.size:
            return None
        if xi.size * yi.size > 500000:
            raise ValueError("native raster window exceeds 500000 cells")
        rows, cols = (
            slice(int(yi.min()), int(yi.max()) + 1),
            slice(int(xi.min()), int(xi.max()) + 1),
        )
        row_order, col_order = np.argsort(-ys[rows]), np.argsort(xs[cols])
        order = np.ix_(row_order, col_order)
        values = _h5_values(group["soilMoisture"], rows, cols)[order]
        retrieval = np.asarray(group["retrievalQualityFlag"][rows, cols])[order]
        surface = np.asarray(group["ancillaryData/surfaceQualityFlag"][rows, cols])[order]
        invalid = (
            ~np.isfinite(values) | (values < 0) | (values > 1) | (retrieval != 0) | (surface != 0)
        )
        flags = {
            "retrieval_nonzero": int(np.count_nonzero(retrieval)),
            "surface_nonzero": int(np.count_nonzero(surface)),
        }
        for bit, name in enumerate(
            (
                "water",
                "urban",
                "precipitation",
                "snow_ice",
                "permanent_snow_ice",
                "frozen",
                "terrain",
                "dense_vegetation",
            )
        ):
            flags[name] = int(np.count_nonzero(surface & (1 << bit)))
        grid = Grid(
            float(xs[cols].min() - dx / 2),
            float(ys[rows].max() + dy / 2),
            dx,
            dy,
            len(yi),
            len(xi),
            crs,
        )
        return Raster(grid, values, invalid, flags, NISAR_POLICY)


def _read_tif(path: Path, window: Window | None = None) -> tuple[FloatArray, Window, Grid]:
    with rasterio.open(path) as src:
        window = window or Window(0, 0, src.width, src.height)
        data = src.read(1, window=window, masked=True)
        values = np.asarray(data.astype(float).filled(np.nan)) * src.scales[0] + src.offsets[0]
        affine = src.window_transform(window)
        if affine.b or affine.d or affine.a <= 0 or affine.e >= 0:
            raise ValueError("context COG must be north-up")
        return (
            values,
            window,
            Grid(
                affine.c,
                affine.f,
                affine.a,
                -affine.e,
                values.shape[0],
                values.shape[1],
                str(src.crs),
            ),
        )


def ecostress(assets: dict[str, Path], field: BaseGeometry, variable: str) -> Raster | None:
    def asset(name: str) -> Path:
        return next(p for n, p in assets.items() if n.lower().endswith("_" + name.lower() + ".tif"))

    with rasterio.open(asset(variable)) as src:
        bounds = project(field, "EPSG:4326", str(src.crs)).bounds
        requested = from_bounds(*bounds, src.transform)
        try:
            window = Window(
                int(np.floor(requested.col_off)),
                int(np.floor(requested.row_off)),
                int(np.ceil(requested.col_off + requested.width))
                - int(np.floor(requested.col_off)),
                int(np.ceil(requested.row_off + requested.height))
                - int(np.floor(requested.row_off)),
            ).intersection(Window(0, 0, src.width, src.height))
        except rasterio.errors.WindowError:
            return None
        if window.width * window.height > 500000:
            raise ValueError("native raster window exceeds 500000 cells")
    values, _, grid = _read_tif(asset(variable), window)
    cloud, _, cloud_grid = _read_tif(asset("cloud"), window)
    water, _, water_grid = _read_tif(asset("water"), window)
    if cloud_grid != grid or water_grid != grid:
        raise ValueError("ECOSTRESS masks do not share the science grid")
    invalid = (
        ~np.isfinite(values)
        | ~np.isfinite(cloud)
        | ~np.isfinite(water)
        | (cloud != 0)
        | (water != 0)
    )
    flags = {"cloud": int(np.count_nonzero(cloud)), "water": int(np.count_nonzero(water))}
    if variable == "lst":
        qc, _, qc_grid = _read_tif(asset("QC"), window)
        if qc_grid != grid:
            raise ValueError("ECOSTRESS QC does not share the science grid")
        bad_qc = ~np.isfinite(qc) | ((np.nan_to_num(qc, nan=3).astype(np.uint16) & 3) != 0)
        invalid |= bad_qc | (values <= 0)
        flags["mandatory_qc_nonzero"] = int(bad_qc.sum())
        policy = (
            "Clear land pixels; mandatory QC bits 0-1 equal 00 (good LST); fill/nonfinite excluded."
        )
    else:
        invalid |= (values < 0) | (values > 1)
        policy = "Clear land pixels; finite ESI in [0,1]; cloud/water/fill excluded."
    return Raster(grid, values, invalid, flags, policy)
