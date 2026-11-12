"""HLS VI v2 NDVI from native separate COG assets, with QA and CRS-aware field means."""

from __future__ import annotations

import asyncio
from datetime import date

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds
from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Capabilities, FetchResult, Period
from itza_science.adapters.granules import Granule, GranuleAccessError, GranuleReader
from itza_science.contracts.canonical_series_schema import Cadence, CanonicalSeries, Var
from itza_science.contracts.common_schema import Confidence
from itza_science.contracts.common_schema import Period as ContractPeriod
from itza_science.contracts.provenance_schema import Provenance
from itza_science.core.errors import Gap
from itza_science.core.manifest import Manifest, load_manifest
from itza_science.geo.clip import AreaWeightedResult, Grid, area_weighted_mean
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
                retrieved=date.today(),
            ),
        )
        return FetchResult(series=[series], gaps=[])

    async def _fetch_day(
        self, box_bbox: tuple[float, float, float, float], day: date, geometry: BaseGeometry
    ) -> tuple[float, float] | None:
        for short_name in _SHORT_NAMES:
            try:
                granules = await self._reader.search_day(
                    short_name, self._entry.version, box_bbox, day
                )
            except GranuleAccessError:
                continue
            if not granules:
                continue
            result = await asyncio.to_thread(_granule_mean, granules[0], geometry)
            if result.mean is not None:
                return result.mean, result.coverage
        return None


def _granule_mean(granule: Granule, geometry: BaseGeometry) -> AreaWeightedResult:
    with rasterio.open(granule.path) as source:
        bounds = transform_bounds("EPSG:4326", source.crs, *geometry.bounds)
        raw_window = from_bounds(*bounds, transform=source.transform)
        col, row = int(np.floor(raw_window.col_off)), int(np.floor(raw_window.row_off))
        right = int(np.ceil(raw_window.col_off + raw_window.width))
        bottom = int(np.ceil(raw_window.row_off + raw_window.height))
        try:
            window = Window(col, row, right - col, bottom - row).intersection(
                Window(0, 0, source.width, source.height)
            )
        except rasterio.errors.WindowError:
            return AreaWeightedResult(mean=None, coverage=0.0)
        raw = source.read(1, window=window, masked=True)
        ndvi = np.asarray(raw.astype(float).filled(np.nan))
        if np.issubdtype(raw.dtype, np.integer):
            ndvi[ndvi == -19999] = np.nan
            scale = source.scales[0] if source.scales[0] != 1 else 0.0001
            ndvi = ndvi * scale + source.offsets[0]
        invalid = ~np.isfinite(ndvi) | (ndvi < -1) | (ndvi > 1)
        if granule.qa_path is not None:
            with rasterio.open(granule.qa_path) as qa:
                if qa.crs != source.crs or qa.transform != source.transform:
                    raise ValueError("HLS QA and NDVI grids differ")
                invalid |= hls_fmask_invalid(qa.read(1, window=window))
        elif source.count > 1:
            # Legacy synthetic fixtures store NDVI/Fmask in two bands.
            invalid |= hls_fmask_invalid(source.read(2, window=window))
        affine = source.window_transform(window)
        grid = Grid(
            lon_min=affine.c,
            lat_max=affine.f,
            dlon=affine.a,
            dlat=-affine.e,
            n_rows=ndvi.shape[0],
            n_cols=ndvi.shape[1],
            crs=str(source.crs),
        )
        return area_weighted_mean(grid, ndvi, invalid, geometry)
