"""Synthetic HLS landscape for boundary tests: four fields and a bare track network.

Fields are fixed boxes in longitude and latitude, so every grid the endpoint asks for samples the
same landscape. Each land use follows its own monthly NDVI curve, with noise and cloud gaps.
"""

from datetime import date

import numpy as np
from pyproj import Transformer
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.terrain.grid import FloatArray, Grid
from itza_science.terrain.sources import Inputs, Observation
from tests.spatial_support import proof

CENTER = (5.33, 36.12)
STEP = 0.0035  # about 315 m in longitude, 390 m in latitude
GAP = 0.0004  # about 36 m of bare track between fields

FIELDS = {
    "cereal-a": box(CENTER[0] - STEP, CENTER[1], CENTER[0] - GAP / 2, CENTER[1] + STEP),
    "summer-b": box(CENTER[0] + GAP / 2, CENTER[1], CENTER[0] + STEP, CENTER[1] + STEP),
    "fallow-c": box(CENTER[0] - STEP, CENTER[1] - STEP, CENTER[0] - GAP / 2, CENTER[1] - GAP),
    "cereal-d": box(CENTER[0] + GAP / 2, CENTER[1] - STEP, CENTER[0] + STEP, CENTER[1] - GAP),
}
_CURVES = {
    "cereal-a": lambda m: 0.2 + 0.55 * np.exp(-(((m - 3.5) / 1.6) ** 2)),
    "summer-b": lambda m: 0.18 + 0.5 * np.exp(-(((m - 7.0) / 1.5) ** 2)),
    "fallow-c": lambda m: 0.16 + 0.05 * np.sin(m / 2),
    "cereal-d": lambda m: 0.25 + 0.4 * np.exp(-(((m - 4.5) / 2.0) ** 2)),
}


def _track(m: np.ndarray) -> np.ndarray:
    return 0.1 + 0.02 * np.sin(m)


def pixel_lonlat(grid: Grid) -> tuple[FloatArray, FloatArray]:
    rows, cols = np.indices(grid.shape)
    x = grid.affine.a * (cols + 0.5) + grid.affine.c
    y = grid.affine.e * (rows + 0.5) + grid.affine.f
    lon, lat = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True).transform(x, y)
    return np.asarray(lon), np.asarray(lat)


def field_labels(grid: Grid) -> dict[str, np.ndarray]:
    lon, lat = pixel_lonlat(grid)
    return {
        name: (lon >= g.bounds[0])
        & (lon <= g.bounds[2])
        & (lat >= g.bounds[1])
        & (lat <= g.bounds[3])
        for name, g in FIELDS.items()
    }


class LandscapeSource:
    """Spatial source returning the landscape; `dates` thins the series, `cloud` adds gaps."""

    def __init__(self, months: int = 24, cloud: float = 0.1, seed: int = 7) -> None:
        self.months = months
        self.cloud = cloud
        self.seed = seed

    async def dem(self, grid: Grid) -> Inputs:
        return Inputs()

    async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
        rng = np.random.default_rng(self.seed)
        labels = field_labels(grid)
        observations = []
        for index in range(self.months):
            month = index % 12 + 1
            day = date(period.start.year + index // 12, month, 15)
            values = np.full(grid.shape, float(_track(np.array(month))))
            for name, mask in labels.items():
                values[mask] = _CURVES[name](np.array(float(month)))
            values = values + rng.normal(0, 0.012, grid.shape)
            values[rng.random(grid.shape) < self.cloud] = np.nan
            observations.append(Observation(day, values, proof(day)))
        return Inputs(observations=observations)
