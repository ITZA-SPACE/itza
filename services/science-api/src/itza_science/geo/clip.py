"""Area-weighted aggregation of a raster grid over a field polygon."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from pyproj import Transformer
from shapely import transform
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry


@dataclass(frozen=True)
class Grid:
    """A regular grid in ``crs``; historical lon/lat names also represent projected x/y.

    Cell (row, col) spans ``[lon_min + col*dlon, lon_min + (col+1)*dlon]`` in
    longitude and ``[lat_max - (row+1)*dlat, lat_max - row*dlat]`` in
    latitude: row 0 is the northernmost row, matching how rasters are
    usually stored (north-up).
    """

    lon_min: float
    lat_max: float
    dlon: float
    dlat: float
    n_rows: int
    n_cols: int
    crs: str = "EPSG:4326"

    def cell_bounds(self, row: int, col: int) -> tuple[float, float, float, float]:
        west = self.lon_min + col * self.dlon
        east = west + self.dlon
        north = self.lat_max - row * self.dlat
        south = north - self.dlat
        return west, south, east, north

    @staticmethod
    def from_centers(
        lons: npt.NDArray[np.floating], lats: npt.NDArray[np.floating], *, crs: str = "EPSG:4326"
    ) -> Grid:
        """Build a ``Grid`` of cells centered on ascending ``lons`` and descending ``lats``."""
        dlon = float((lons[-1] - lons[0]) / (len(lons) - 1)) if len(lons) > 1 else 1.0
        dlat = float((lats[0] - lats[-1]) / (len(lats) - 1)) if len(lats) > 1 else 1.0
        return Grid(
            lon_min=float(lons[0]) - dlon / 2,
            lat_max=float(lats[0]) + dlat / 2,
            dlon=dlon,
            dlat=dlat,
            n_rows=len(lats),
            n_cols=len(lons),
            crs=crs,
        )


@dataclass(frozen=True)
class AreaWeightedResult:
    mean: float | None
    """Area-weighted mean over valid, overlapping pixels; ``None`` if none overlap."""
    coverage: float
    """Share of the field's own area covered by valid, overlapping pixels, in [0, 1]."""


def area_weighted_mean(
    grid: Grid,
    values: npt.NDArray[np.floating],
    invalid: npt.NDArray[np.bool_],
    field: BaseGeometry,
) -> AreaWeightedResult:
    """Area-weighted mean of ``values`` over ``field``, skipping ``invalid`` pixels.

    Each grid cell contributes in proportion to the area of its overlap with
    the field polygon, not just whether its centroid falls inside it.
    """
    native_field = _project(field, "EPSG:4326", grid.crs)
    field_area = _project(field, "EPSG:4326", "EPSG:6933").area
    west, south, east, north = native_field.bounds
    first_col = max(0, int(np.floor((west - grid.lon_min) / grid.dlon)))
    last_col = min(grid.n_cols, int(np.ceil((east - grid.lon_min) / grid.dlon)))
    first_row = max(0, int(np.floor((grid.lat_max - north) / grid.dlat)))
    last_row = min(grid.n_rows, int(np.ceil((grid.lat_max - south) / grid.dlat)))
    weighted_sum = 0.0
    total_weight = 0.0
    for row in range(first_row, last_row):
        for col in range(first_col, last_col):
            if invalid[row, col] or not np.isfinite(values[row, col]):
                continue
            cell = box(*grid.cell_bounds(row, col))
            overlap = cell.intersection(native_field)
            if overlap.is_empty:
                continue
            area = _project(overlap, grid.crs, "EPSG:6933").area
            if area <= 0:
                continue
            weighted_sum += float(values[row, col]) * area
            total_weight += area
    if total_weight <= 0.0:
        return AreaWeightedResult(mean=None, coverage=0.0)
    return AreaWeightedResult(
        mean=weighted_sum / total_weight,
        coverage=min(total_weight / field_area, 1.0) if field_area > 0 else 0.0,
    )


def _project(geometry: BaseGeometry, source: str, target: str) -> BaseGeometry:
    if source == target:
        return geometry
    transformer = Transformer.from_crs(source, target, always_xy=True)

    def coordinates(array: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
        return np.column_stack(transformer.transform(array[:, 0], array[:, 1]))

    return transform(geometry, coordinates)
