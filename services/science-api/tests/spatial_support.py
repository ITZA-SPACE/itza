"""Explicit synthetic spatial fixtures: separated vegetation bands and a planar DEM."""

from datetime import date

import numpy as np

from itza_science.adapters.base import Period
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.terrain.grid import Grid
from itza_science.terrain.models import Source
from itza_science.terrain.sources import Inputs, Observation


def proof(day: date, product: str = "synthetic-HLS", resolution: float = 30) -> Source:
    return Source(
        source="synthetic-fixture",
        product=product,
        version="1",
        resolution_m=resolution,
        period=SourcePeriod(start=day, end=day),
        method="synthetic test fixture",
        coarse=resolution > 30,
    )


class FixtureSpatialSource:
    calls = 0

    async def dem(self, grid: Grid) -> Inputs:
        self.calls += 1
        _, cols = np.indices(grid.shape)
        return Inputs(
            elevation=1000 - cols.astype(float) * 3,
            dem_source=proof(date(2000, 2, 11), "synthetic-DEM"),
        )

    async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
        self.calls += 1
        rows, cols = np.indices(grid.shape)
        field_cols = np.where(grid.mask)[1]
        bands = np.minimum(
            2, (cols - field_cols.min()) * 3 // (field_cols.max() - field_cols.min() + 1)
        )
        base = 0.15 + 0.25 * bands + 0.0001 * rows
        observations = []
        for year in range(period.start.year, period.end.year + 1):
            for month, offset in ((3, 0.0), (6, 0.1), (9, 0.03)):
                day = date(year, month, 1)
                if period.start <= day <= period.end:
                    observations.append(Observation(day, base + offset, proof(day)))
        observations.append(
            Observation(
                period.start,
                np.full(grid.shape, 0.3),
                proof(period.start, "synthetic-NISAR", 200),
                "moisture",
            )
        )
        return Inputs(observations=observations)
