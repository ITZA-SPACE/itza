"""Area-weighted aggregation of a raster grid over a field polygon."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry


@dataclass(frozen=True)
class Grid:
    """A regular lon/lat grid.

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

    def cell_bounds(self, row: int, col: int) -> tuple[float, float, float, float]:
        west = self.lon_min + col * self.dlon
        east = west + self.dlon
        north = self.lat_max - row * self.dlat
        south = north - self.dlat
        return west, south, east, north

    @staticmethod
    def from_centers(lons: npt.NDArray[np.floating], lats: npt.NDArray[np.floating]) -> Grid:
        """Build a ``Grid`` of cells centered on ascending ``lons`` and descending ``lats``."""
        dlon = float(lons[1] - lons[0]) if len(lons) > 1 else 1.0
        dlat = float(lats[0] - lats[1]) if len(lats) > 1 else 1.0
        return Grid(
            lon_min=float(lons[0]) - dlon / 2,
            lat_max=float(lats[0]) + dlat / 2,
            dlon=dlon,
            dlat=dlat,
            n_rows=len(lats),
            n_cols=len(lons),
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
    weighted_sum = 0.0
    total_weight = 0.0
    covered_area = 0.0
    field_area = field.area
    for row in range(grid.n_rows):
        for col in range(grid.n_cols):
            if invalid[row, col]:
                continue
            west, south, east, north = grid.cell_bounds(row, col)
            cell = box(west, south, east, north)
            if not cell.intersects(field):
                continue
            overlap = cell.intersection(field).area
            if overlap <= 0.0:
                continue
            value = float(values[row, col])
            weighted_sum += value * overlap
            total_weight += overlap
            covered_area += overlap
    if total_weight <= 0.0:
        return AreaWeightedResult(mean=None, coverage=0.0)
    coverage = min(covered_area / field_area, 1.0) if field_area > 0.0 else 0.0
    return AreaWeightedResult(mean=weighted_sum / total_weight, coverage=coverage)
