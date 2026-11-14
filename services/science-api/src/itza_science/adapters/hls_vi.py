"""HLS Vegetation Indices v2.0 (L30/S30) NDVI, QA-masked and area-weighted to the field.

Simplification: the real HLS VI product and its Fmask QA band ship as
separate per-band COG files; here one granule is treated as a two-band
GeoTIFF (band 1 = NDVI, band 2 = Fmask) to keep the adapter boundary
(``GranuleReader`` returns one path per granule) uniform across sources.
A real integration needs to fetch and align both bands itself.
"""

from __future__ import annotations

from datetime import date

import rioxarray
import xarray as xr
from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Capabilities, FetchResult, Period
from itza_science.adapters.granules import GranuleReader
from itza_science.contracts.canonical_series_schema import Cadence, CanonicalSeries, Var
from itza_science.contracts.common_schema import Confidence
from itza_science.contracts.common_schema import Period as ContractPeriod
from itza_science.contracts.provenance_schema import Provenance
from itza_science.core.errors import Gap
from itza_science.core.manifest import Manifest, load_manifest
from itza_science.geo.clip import Grid, area_weighted_mean
from itza_science.geo.geojson import bbox
from itza_science.geo.qa import hls_fmask_invalid

ID = "hls_vi"
_SHORT_NAMES = ("HLSL30_VI", "HLSS30_VI")
"""The manifest lists one logical ``hls_vi`` source; L30 and S30 are its two
underlying CMR collections (Landsat and Sentinel-2 tiles), tried in order."""
_MIN_COVERAGE_HIGH = 0.5
_OBSERVED = 0
_DEGRADED = 1
_MISSING = 2


class HlsViAdapter:
    id = ID

    def __init__(self, reader: GranuleReader, manifest: Manifest | None = None) -> None:
        self._reader = reader
        self._manifest = manifest or load_manifest()
        self._entry = self._manifest.sources[self.id]

    def capabilities(self) -> Capabilities:
        return Capabilities(
            id=self.id,
            variables=(Var.ndvi,),
            resolution_m=self._entry.resolution_m,
            auth="earthdata",
        )

    async def fetch(
        self, geometry: BaseGeometry, period: Period, variables: tuple[Var, ...]
    ) -> FetchResult:
        if Var.ndvi not in variables:
            return FetchResult(series=[], gaps=[])
        if not self._reader.credentials_available():
            return FetchResult(
                series=[],
                gaps=[
                    Gap(
                        var=Var.ndvi.value,
                        reason="missing Earthdata credentials",
                        severity="warning",
                    )
                ],
            )
        box_bbox = bbox(geometry)
        values: list[float | None] = []
        quality: list[int] = []
        any_observed = False
        for day in period.days():
            observation = await self._fetch_day(box_bbox, day, geometry)
            if observation is None:
                values.append(None)
                quality.append(_MISSING)
                continue
            mean, coverage = observation
            any_observed = True
            values.append(round(mean, 4))
            quality.append(_OBSERVED if coverage >= _MIN_COVERAGE_HIGH else _DEGRADED)
        if not any_observed:
            return FetchResult(
                series=[],
                gaps=[
                    Gap(
                        var=Var.ndvi.value,
                        reason="no clear HLS VI scene in the requested period",
                        severity="warning",
                    )
                ],
            )
        series = CanonicalSeries(
            var=Var.ndvi,
            unit=self._entry.variables["ndvi"].unit,
            cadence=Cadence.daily,
            start=period.start,
            values=values,
            quality=quality,
            provenance=Provenance(
                source=self.id,
                product="/".join(_SHORT_NAMES),
                version=self._entry.version,
                resolution_m=self._entry.resolution_m,
                period=ContractPeriod(start=period.start, end=period.end),
                quality=Confidence.medium,
                method="area_weighted_qa_masked",
            ),
        )
        return FetchResult(series=[series], gaps=[])

    async def _fetch_day(
        self, box_bbox: tuple[float, float, float, float], day: date, geometry: BaseGeometry
    ) -> tuple[float, float] | None:
        for short_name in _SHORT_NAMES:
            granules = await self._reader.search_day(short_name, self._entry.version, box_bbox, day)
            if not granules:
                continue
            da = rioxarray.open_rasterio(granules[0].path)
            assert isinstance(da, xr.DataArray)  # noqa: S101 - our own two-band GeoTIFF
            try:
                ndvi = da.sel(band=1).to_numpy().astype(float)
                fmask = da.sel(band=2).to_numpy()
                xs = da["x"].to_numpy()
                ys = da["y"].to_numpy()
            finally:
                da.close()
            invalid = hls_fmask_invalid(fmask)
            grid = Grid.from_centers(xs, ys)
            result = area_weighted_mean(grid, ndvi, invalid, geometry)
            if result.mean is not None:
                return result.mean, result.coverage
        return None
