"""SMAP L4 Global surface + root-zone soil moisture, daily means of the 3-hourly product."""

from __future__ import annotations

from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Capabilities, FetchResult, Period
from itza_science.adapters.granules import GranuleReader
from itza_science.adapters.netcdf_grid import load_daily_mean_grid
from itza_science.contracts.canonical_series_schema import Cadence, CanonicalSeries, Var
from itza_science.contracts.common_schema import Confidence
from itza_science.contracts.common_schema import Period as ContractPeriod
from itza_science.contracts.provenance_schema import Provenance
from itza_science.core.errors import Gap
from itza_science.core.manifest import Manifest, load_manifest
from itza_science.geo.clip import AreaWeightedResult, area_weighted_mean
from itza_science.geo.geojson import bbox

ID = "smap_l4"
_OBSERVED = 0
_MISSING = 2


class SmapL4Adapter:
    id = ID

    def __init__(self, reader: GranuleReader, manifest: Manifest | None = None) -> None:
        self._reader = reader
        self._manifest = manifest or load_manifest()
        self._entry = self._manifest.sources[self.id]

    def capabilities(self) -> Capabilities:
        return Capabilities(
            id=self.id,
            variables=(Var.sm_surface, Var.sm_rootzone),
            resolution_m=self._entry.resolution_m,
            auth="earthdata",
        )

    async def fetch(
        self, geometry: BaseGeometry, period: Period, variables: tuple[Var, ...]
    ) -> FetchResult:
        wanted = [v for v in (Var.sm_surface, Var.sm_rootzone) if v in variables]
        if not wanted:
            return FetchResult(series=[], gaps=[])
        if not self._reader.credentials_available():
            return FetchResult(
                series=[],
                gaps=[
                    Gap(var=v.value, reason="missing Earthdata credentials", severity="warning")
                    for v in wanted
                ],
            )
        box_bbox = bbox(geometry)
        values: dict[Var, list[float | None]] = {v: [] for v in wanted}
        quality: dict[Var, list[int]] = {v: [] for v in wanted}
        any_observed = dict.fromkeys(wanted, False)
        for day in period.days():
            granules = await self._reader.search_day(
                self._entry.product, self._entry.version, box_bbox, day
            )
            results: dict[Var, AreaWeightedResult | None] = {}
            if granules:
                for v in wanted:
                    var_name = self._entry.variables[v.value].source_var
                    grid, grid_values, invalid = load_daily_mean_grid(granules[0].path, var_name)
                    results[v] = area_weighted_mean(grid, grid_values, invalid, geometry)
            for v in wanted:
                result = results.get(v)
                if result is None or result.mean is None:
                    values[v].append(None)
                    quality[v].append(_MISSING)
                    continue
                any_observed[v] = True
                values[v].append(round(result.mean, 4))
                quality[v].append(_OBSERVED)
        series: list[CanonicalSeries] = []
        gaps: list[Gap] = []
        for v in wanted:
            if not any_observed[v]:
                gaps.append(
                    Gap(
                        var=v.value,
                        reason="no SMAP L4 granule in the requested period",
                        severity="warning",
                    )
                )
                continue
            series.append(
                CanonicalSeries(
                    var=v,
                    unit=self._entry.variables[v.value].unit,
                    cadence=Cadence.daily,
                    start=period.start,
                    values=values[v],
                    quality=quality[v],
                    provenance=Provenance(
                        source=self.id,
                        product=self._entry.product,
                        version=self._entry.version,
                        resolution_m=self._entry.resolution_m,
                        period=ContractPeriod(start=period.start, end=period.end),
                        quality=Confidence.medium,
                        method="area_weighted",
                    ),
                )
            )
        return FetchResult(series=series, gaps=gaps)
