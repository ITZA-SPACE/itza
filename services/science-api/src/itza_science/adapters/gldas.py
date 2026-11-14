"""Daily modeled Noah moisture/ET from bounded native GLDAS and NLDAS field clips."""

from __future__ import annotations

import asyncio
from contextlib import closing
from datetime import date, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Capabilities, FetchResult, Period
from itza_science.adapters.granules import EarthaccessGranuleReader, Granule, GranuleReader
from itza_science.contracts.canonical_series_schema import Cadence, CanonicalSeries, Var
from itza_science.contracts.common_schema import Confidence
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.provenance_schema import Provenance
from itza_science.core.errors import Gap
from itza_science.core.manifest import Manifest, load_manifest
from itza_science.geo.clip import Grid, area_weighted_mean

GLDAS = "gldas_noah"
NLDAS = "nldas_noah"
LAYERS = ("SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst")
VARIABLES = {GLDAS: (*LAYERS, "Evap_tavg"), NLDAS: ("SoilM_0_100cm", "Evap")}
NLDAS_DOMAIN = box(-125, 25, -67, 53)  # Product coverage, not a national boundary.


class LandSurfaceReader(EarthaccessGranuleReader):
    """Use the existing serialized Earthdata authentication; read field windows only."""

    def _download(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date | Period | None,
    ) -> list[Granule]:
        import earthaccess  # noqa: PLC0415 - authenticated source boundary

        if not isinstance(day, date):
            raise ValueError("land-surface clips require one day")
        source = NLDAS if short_name.startswith("NLDAS") else GLDAS
        if not earthaccess.login(strategy="environment", persist=False).authenticated:
            raise ValueError("Earthdata authentication unavailable")
        # ET time bounds end at the timestamp: next midnight completes this UTC day.
        results = earthaccess.search_data(
            short_name=short_name,
            version=version,
            bounding_box=bbox,
            temporal=(f"{day}T00:00:00Z", f"{day + timedelta(days=1)}T00:00:00Z"),
            count=35,
        )
        if len(results) >= 35:
            raise ValueError("daily granule budget exceeded")
        self._download_dir.mkdir(parents=True, exist_ok=True)
        granules = []
        for result in results:
            urls = result.data_links(access="external")
            url = next(u for u in urls if u.endswith((".nc4", ".nc")))
            key = sha256(f"{url}|{bbox}".encode()).hexdigest()
            path = self._download_dir / f"{key}.nc4"
            if not path.exists():
                with closing(
                    earthaccess.open(
                        [url], open_kwargs={"cache_type": "blockcache", "block_size": 262144}
                    )[0]
                ) as handle:
                    clip(handle, path, bbox, source)
            granules.append(Granule(path=path, data_date=day))
        return granules


def clip(handle: Any, path: Path, bounds: tuple[float, float, float, float], source: str) -> None:
    with xr.open_dataset(handle, engine="h5netcdf") as dataset:
        step = 0.125 if source == NLDAS else 0.25
        lat, lon = np.asarray(dataset.lat), np.asarray(dataset.lon)
        rows = np.flatnonzero((lat >= bounds[1] - step) & (lat <= bounds[3] + step))
        cols = np.flatnonzero((lon >= bounds[0] - step) & (lon <= bounds[2] + step))
        if min(len(rows), len(cols)) < 2 or max(len(rows), len(cols)) > 64:
            raise ValueError("field outside native coverage or clip too large")
        subset = dataset[[*VARIABLES[source], "time_bnds"]].isel(lat=rows, lon=cols).load()
        temporary = path.with_suffix(".tmp")
        subset.to_netcdf(temporary, engine="h5netcdf")
        temporary.replace(path)


def validate_native_grid(ds: Any, source: str) -> tuple[Any, Any]:
    lat, lon = np.asarray(ds.lat, dtype=float), np.asarray(ds.lon, dtype=float)
    if min(len(lat), len(lon)) < 2 or max(len(lat), len(lon)) > 64:
        raise ValueError("invalid clipped grid")
    step = 0.125 if source == NLDAS else 0.25
    if not np.allclose(np.diff(lon), step) or not np.allclose(np.abs(np.diff(lat)), step):
        raise ValueError("invalid native grid spacing")
    for name in VARIABLES[source]:
        required = "kg m-2 s-1" if name == "Evap_tavg" else "kg m-2"
        if ds[name].attrs.get("units") != required:
            raise ValueError("unexpected native variable units")
    return lat, lon


def daily_values(
    granules: list[Granule], source: str, day: date, field: BaseGeometry
) -> dict[Var, float | None]:
    """Use native time bounds, never scale a partial day's ET up to a full day."""
    moisture: dict[int, float] = {}
    evaporation: dict[int, float] = {}
    start = np.datetime64(str(day), "s")
    seconds = 3600 if source == NLDAS else 10800
    expected = set(range(0, 86400, seconds))
    for granule in granules:
        with xr.open_dataset(granule.path, engine="h5netcdf") as ds:
            lat, lon = validate_native_grid(ds, source)
            names = VARIABLES[source]
            for index, time in enumerate(np.asarray(ds.time).astype("datetime64[s]")):
                offset = int((time - start) / np.timedelta64(1, "s"))
                bound = np.asarray(ds.time_bnds.isel(time=index)).astype("datetime64[s]")
                begin = int((bound[0] - start) / np.timedelta64(1, "s"))
                duration = int((bound[1] - bound[0]) / np.timedelta64(1, "s"))
                if duration != seconds or bound[1] != time:
                    raise ValueError("unexpected time bounds")
                if offset in expected:
                    raw = (
                        sum(
                            ds[n].isel(time=index)
                            for n in (names[:1] if source == NLDAS else names[:3])
                        )
                        / 1000
                    )
                    value = field_mean(raw, lat, lon, field, moisture=True)
                    if value is not None:
                        if offset in moisture:
                            raise ValueError("duplicate moisture timestamp")
                        moisture[offset] = value
                if begin in expected:
                    raw = ds[names[-1]].isel(time=index)
                    value = field_mean(raw, lat, lon, field, moisture=False)
                    if value is not None:
                        if begin in evaporation:
                            raise ValueError("duplicate ET interval")
                        evaporation[begin] = value * (seconds if source == GLDAS else 1)
    return {
        Var.sm_rootzone: float(np.mean(list(moisture.values())))
        if set(moisture) == expected
        else None,
        Var.et_actual: float(sum(evaporation.values())) if set(evaporation) == expected else None,
    }


def field_mean(
    data: Any, lat: Any, lon: Any, field: BaseGeometry, *, moisture: bool
) -> float | None:
    values = np.asarray(data.transpose("lat", "lon"), dtype=float)
    invalid = ~np.isfinite(values)
    if moisture:
        invalid |= (values < 0) | (values > 1)
    if lat[0] < lat[-1]:
        lat, values, invalid = lat[::-1], values[::-1], invalid[::-1]
    grid = Grid.from_centers(lon, lat)
    result = area_weighted_mean(grid, values, invalid, field)
    return result.mean if result.coverage >= 0.99 else None


class GldasAdapter:
    id = GLDAS

    def __init__(self, reader: GranuleReader, manifest: Manifest | None = None) -> None:
        self.reader = reader
        self.manifest = manifest or load_manifest()

    def capabilities(self) -> Capabilities:
        return Capabilities(
            id=self.id,
            variables=(Var.sm_rootzone, Var.et_actual),
            resolution_m=27830,
            auth="earthdata",
        )

    async def fetch(
        self, geometry: BaseGeometry, period: Period, variables: tuple[Var, ...]
    ) -> FetchResult:
        wanted = [v for v in (Var.sm_rootzone, Var.et_actual) if v in variables]
        if not wanted:
            return FetchResult([], [])
        if not self.reader.credentials_available():
            return FetchResult(
                [],
                [
                    Gap(
                        var=v.value,
                        reason="Missing Earthdata credentials for modeled GLDAS/NLDAS",
                        severity="warning",
                    )
                    for v in wanted
                ],
            )
        sources = [NLDAS, GLDAS] if NLDAS_DOMAIN.covers(geometry) else [GLDAS]
        series, gaps = [], []
        provided: dict[Var, set[date]] = {v: set() for v in wanted}
        for source in sources:
            entry = self.manifest.sources[source]
            values: dict[Var, list[float | None]] = {v: [] for v in wanted}
            for day in period.days():
                if all(day in provided[v] for v in wanted):
                    for variable in wanted:
                        values[variable].append(None)
                    continue
                try:
                    files = await self.reader.search_day(
                        entry.product, entry.version, geometry.bounds, day
                    )
                    result = await asyncio.to_thread(daily_values, files, source, day, geometry)
                except Exception:
                    result = {}
                for variable in wanted:
                    values[variable].append(result.get(variable))
            for variable in wanted:
                observed = values[variable]
                if not any(v is not None for v in observed):
                    if all(day in provided[variable] for day in period.days()):
                        continue
                    gaps.append(
                        Gap(
                            var=variable.value,
                            reason=f"No complete modeled {source} day available",
                            severity="warning",
                        )
                    )
                    continue
                provided[variable].update(
                    day
                    for day, value in zip(period.days(), observed, strict=True)
                    if value is not None
                )
                series.append(
                    CanonicalSeries(
                        var=variable,
                        unit="m3/m3" if variable == Var.sm_rootzone else "mm/day",
                        cadence=Cadence.daily,
                        start=period.start,
                        values=observed,
                        quality=[1 if v is not None else 2 for v in observed],
                        provenance=Provenance(
                            source=source,
                            product=entry.product,
                            version=entry.version,
                            resolution_m=entry.resolution_m,
                            period=SourcePeriod(start=period.start, end=period.end),
                            quality=Confidence.low,
                            method=(
                                "modeled; 0-100 cm water mass / 1000; complete UTC days; "
                                "native ET bounds; signed net ET includes condensation"
                            ),
                            retrieved=date.today(),
                        ),
                    )
                )
                if any(v is None for v in observed):
                    gaps.append(
                        Gap(
                            var=variable.value,
                            reason=f"Incomplete modeled {source} days remain missing",
                            severity="warning",
                        )
                    )
        return FetchResult(series, gaps)


def merge_modeled_fallbacks(series: list[CanonicalSeries]) -> list[CanonicalSeries]:
    """Resolve modeled alternatives per day while retaining source switches and flags."""
    output = [s for s in series if s.var not in (Var.sm_rootzone, Var.et_actual)]
    for variable in (Var.sm_rootzone, Var.et_actual):
        group = [s for s in series if s.var == variable]
        if not group:
            continue
        rank = {"smap_l4": 0, NLDAS: 1, GLDAS: 2}
        group.sort(key=lambda s: rank.get(s.provenance.source, 100))
        if len(group) == 1:
            output.extend(group)
            continue
        if any(s.unit != group[0].unit or s.cadence != Cadence.daily for s in group):
            raise ValueError("incompatible land-surface source grids")
        start = min(s.start for s in group)
        end = max(s.start + timedelta(days=len(s.values) - 1) for s in group)
        values, flags, segments = [], [], []
        used: set[str] = set()
        last = ""
        for day in Period(start, end).days():
            value, flag = None, 2
            for candidate in group:
                index = (day - candidate.start).days
                if 0 <= index < len(candidate.values) and candidate.values[index] is not None:
                    value, flag = candidate.values[index], candidate.quality[index]
                    source = candidate.provenance.source
                    used.add(source)
                    if source != last:
                        segments.append({"start": day, "source": source})
                        last = source
                    break
            values.append(value)
            flags.append(flag)
        primary = next((s for s in group if s.provenance.source in used), group[0])
        document = primary.model_dump()
        document.update(start=start, values=values, quality=flags, segments=segments)
        proof = primary.provenance.model_dump()
        proof.update(
            period={"start": start, "end": end},
            derived_from=sorted(used),
            resolution_m=max(
                s.provenance.resolution_m for s in group if s.provenance.source in used
            )
            if used
            else primary.provenance.resolution_m,
            method="modeled fallback priority splice; original flags and source switches retained",
        )
        if used & {NLDAS, GLDAS}:
            proof["quality"] = Confidence.low
        document["provenance"] = proof
        output.append(CanonicalSeries.model_validate(document))
    return output
