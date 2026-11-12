"""Local, unfilled D8 routing and terrain derivatives on a metric raster."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.ndimage import uniform_filter
from shapely.geometry import LineString, mapping

from itza_science.terrain.grid import FloatArray, Grid, project

DIRECTIONS = ((0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1))


@dataclass
class Terrain:
    elevation: FloatArray
    slope: FloatArray
    aspect: FloatArray
    accumulation: FloatArray
    slope_class: FloatArray
    concavity: FloatArray
    downstream: NDArray[np.int64]


def derive(elevation: FloatArray, cell_m: float = 30) -> Terrain:
    if elevation.ndim != 2 or min(elevation.shape) < 2:
        raise ValueError("DEM must be a two-dimensional raster with at least two rows and columns")
    valid = np.isfinite(elevation)
    dy, dx = np.gradient(elevation, cell_m)
    slope = np.degrees(np.arctan(np.hypot(dx, dy)))
    aspect = np.mod(np.degrees(np.arctan2(-dx, dy)), 360)
    aspect[np.hypot(dx, dy) == 0] = np.nan
    height, width = elevation.shape
    target = np.full(elevation.shape, -1, dtype=np.int64)
    best = np.zeros(elevation.shape)
    for dr, dc in DIRECTIONS:
        r0, r1 = max(0, -dr), min(height, height - dr)
        c0, c1 = max(0, -dc), min(width, width - dc)
        origin = elevation[r0:r1, c0:c1]
        neighbor = elevation[r0 + dr : r1 + dr, c0 + dc : c1 + dc]
        drop = (origin - neighbor) / (cell_m * np.hypot(dr, dc))
        take = np.isfinite(drop) & (drop > best[r0:r1, c0:c1])
        rr, cc = np.mgrid[r0:r1, c0:c1]
        target[r0:r1, c0:c1][take] = ((rr + dr) * width + cc + dc)[take]
        best[r0:r1, c0:c1][take] = drop[take]
    accumulation = valid.astype(float)
    for index in np.argsort(-np.where(valid, elevation, -np.inf).ravel()):
        downstream = target.ravel()[index]
        if downstream >= 0:
            accumulation.ravel()[downstream] += accumulation.ravel()[index]
    accumulation[~valid] = np.nan
    numerator = uniform_filter(np.where(valid, elevation, 0), size=5, mode="nearest")
    denominator = uniform_filter(valid.astype(float), size=5, mode="nearest")
    local_mean = np.divide(
        numerator, denominator, out=np.full_like(elevation, np.nan), where=denominator > 0
    )
    concavity = elevation - local_mean
    classes = np.digitize(slope, [2, 5, 10]).astype(float)
    classes[~np.isfinite(slope)] = np.nan
    return Terrain(elevation, slope, aspect, accumulation, classes, concavity, target)


def flow_lines(terrain: Terrain, grid: Grid) -> dict[str, object]:
    valid = grid.mask & np.isfinite(terrain.accumulation)
    threshold = (
        max(10.0, float(np.quantile(terrain.accumulation[valid], 0.9))) if valid.any() else 10.0
    )
    features = []
    for row, col in zip(*np.where(valid & (terrain.accumulation >= threshold)), strict=True):
        target = terrain.downstream[row, col]
        if target < 0:
            continue
        rr, cc = divmod(int(target), grid.width)
        a = grid.affine @ (float(col) + 0.5, float(row) + 0.5)
        b = grid.affine @ (cc + 0.5, rr + 0.5)
        line = LineString([a, b]).intersection(grid.field)
        if line.is_empty or line.length <= 0:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(project(line, grid.crs, "EPSG:4326")),
                "properties": {"upstream_cells": float(terrain.accumulation[row, col])},
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "method": "unfilled D8; local buffer only; threshold max(10 cells, field p90)",
        "threshold_cells": threshold,
    }
