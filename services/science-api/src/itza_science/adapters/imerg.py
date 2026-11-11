"""GPM IMERG Final daily V07, falling back to Late daily per missing day."""

from __future__ import annotations

from datetime import date

from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Capabilities, FetchResult, Period
from itza_science.adapters.granules import GranuleReader
from itza_science.adapters.netcdf_grid import load_daily_mean_grid
from itza_science.contracts.canonical_series_schema import Cadence, CanonicalSeries, Segment, Var
from itza_science.contracts.common_schema import Confidence
from itza_science.contracts.common_schema import Period as ContractPeriod
from itza_science.contracts.provenance_schema import Provenance
from itza_science.core.errors import Gap
from itza_science.core.manifest import Manifest, load_manifest
from itza_science.geo.clip import area_weighted_mean
from itza_science.geo.geojson import bbox

ID = "gpm_imerg_final_daily"
_OBSERVED = 0
_DEGRADED = 1
_MISSING = 2


class ImergAdapter:
    """Precipitation only; chain and variable mapping come from data-sources.yaml."""

    id = ID

    def __init__(self, reader: GranuleReader, manifest: Manifest | None = None) -> None:
        self._reader = reader
        self._manifest = manifest or load_manifest()
        self._chain = self._manifest.chain("precip")

    def capabilities(self) -> Capabilities:
        primary = self._manifest.sources[self._chain[0]]
        return Capabilities(
            id=self.id, variables=(Var.precip,), resolution_m=primary.resolution_m, auth="earthdata"
        )

    async def fetch(
        self, geometry: BaseGeometry, period: Period, variables: tuple[Var, ...]
    ) -> FetchResult:
        if Var.precip not in variables:
            return FetchResult(series=[], gaps=[])
        if not self._reader.credentials_available():
            return FetchResult(
                series=[],
                gaps=[
                    Gap(
                        var=Var.precip.value,
                        reason="missing Earthdata credentials",
                        severity="warning",
                    )
                ],
            )
        box_bbox = bbox(geometry)
        primary_id = self._chain[0]
        primary = self._manifest.sources[primary_id]
        values: list[float | None] = []
        quality: list[int] = []
        segments: list[Segment] = []
        current_source = primary_id
        any_observed = False
        for day in period.days():
            observation = await self._fetch_day(box_bbox, day, geometry)
            if observation is None:
                values.append(None)
                quality.append(_MISSING)
                continue
            mean, source = observation
            any_observed = True
            values.append(round(mean, 3))
            quality.append(_OBSERVED if source == primary_id else _DEGRADED)
            if source != current_source:
                segments.append(Segment(start=day, source=source))
                current_source = source
        if not any_observed:
            return FetchResult(
                series=[],
                gaps=[
                    Gap(
                        var=Var.precip.value,
                        reason="no IMERG granule in the requested period",
                        severity="warning",
                    )
                ],
            )
        series = CanonicalSeries(
            var=Var.precip,
            unit=primary.variables["precip"].unit,
            cadence=Cadence.daily,
            start=period.start,
            values=values,
            quality=quality,
            provenance=Provenance(
                source=primary_id,
                product=primary.product,
                version=primary.version,
                resolution_m=primary.resolution_m,
                period=ContractPeriod(start=period.start, end=period.end),
                quality=Confidence.high,
                method="area_weighted",
            ),
            segments=segments or None,
        )
        return FetchResult(series=[series], gaps=[])

    async def _fetch_day(
        self, box_bbox: tuple[float, float, float, float], day: date, geometry: BaseGeometry
    ) -> tuple[float, str] | None:
        for source_id in self._chain:
            entry = self._manifest.sources[source_id]
            var_name = entry.variables["precip"].source_var
            granules = await self._reader.search_day(entry.product, entry.version, box_bbox, day)
            if not granules:
                continue
            grid, grid_values, invalid = load_daily_mean_grid(granules[0].path, var_name)
            result = area_weighted_mean(grid, grid_values, invalid, geometry)
            if result.mean is not None:
                return result.mean, source_id
        return None
