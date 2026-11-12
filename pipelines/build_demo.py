"""Resumable hero-field precompute. Service modules run directly, without HTTP.

Run from the repository root with the science-api uv environment; see README.md.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal, Protocol

import h5py
import numpy as np
import rasterio
import xarray as xr
import yaml
from itza_science.adapters.base import Period
from itza_science.adapters.granules import EarthaccessGranuleReader, Granule, GranuleAccessError
from itza_science.api.bundles import (
    SUPPORTED_VARS,
    BundleRequest,
    PeriodInput,
    _add_terrain,
    _build_bundle,
)
from itza_science.api.ml import Source as MLSource
from itza_science.api.ml import StressModel, StressRequest
from itza_science.context.models import GediQuery, PointQuery, SceneQuery
from itza_science.contracts.canonical_series_schema import CanonicalSeries
from itza_science.contracts.field_bundle_schema import FieldBundle, Gap, Polygon
from itza_science.core.config import Settings
from itza_science.core.field import field_id, to_shapely
from itza_science.main import create_app
from pydantic import BaseModel, ConfigDict, Field, model_validator
from rasterio.features import geometry_mask
from rasterio.io import MemoryFile
from rasterio.warp import transform_geom

from capture_fixtures import Archive, digest, write_json
from ml.data import Day, build_features  # type: ignore[attr-defined]  # namespace module

ROOT = Path(__file__).resolve().parents[1]
POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
ORNL = "https://modis.ornl.gov/rst/api/v1/MOD13Q1"
CDL = "https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/exportImage"
MAX_FIELD_BYTES = 5_000_000
MAX_FRAME_BYTES = 150_000
LOG = logging.getLogger("build-demo")


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Hero(Model):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    role: Literal["story", "proof"]
    rationale: str = Field(min_length=1)
    geometry: Polygon

    @model_validator(mode="after")
    def valid_geometry(self) -> Hero:
        # Reuse service boundary validation, including valid, bounded coordinates.
        BundleRequest(
            geometry=self.geometry,
            period=PeriodInput(start=date(2025, 1, 1), end=date(2025, 1, 1)),
        )
        return self


class Manifest(Model):
    version: Literal["hero-fields/1"]
    period: dict[Literal["start", "end"], date]
    fields: list[Hero] = Field(min_length=4)

    @model_validator(mode="after")
    def coverage(self) -> Manifest:
        if len({f.id for f in self.fields}) != len(self.fields):
            raise ValueError("duplicate hero ids")
        if sum(f.role == "proof" for f in self.fields) < 3:
            raise ValueError("at least three proof fields are required")
        if not any(f.role == "story" for f in self.fields):
            raise ValueError("a story field is required")
        if self.period["start"] > self.period["end"]:
            raise ValueError("period is reversed")
        return self


class PowerProperties(BaseModel):
    parameter: dict[str, dict[str, float]]


class PowerResponse(BaseModel):
    properties: PowerProperties


class Composite(BaseModel):
    calendar_date: date
    data: list[int] = Field(min_length=1, max_length=1)


class Subset(BaseModel):
    nrows: Literal[1]
    ncols: Literal[1]
    subset: list[Composite]


class AvailableDate(BaseModel):
    modis_date: str = Field(pattern=r"^A\d{7}$")
    calendar_date: date


class Dates(BaseModel):
    dates: list[AvailableDate]


def dates(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def canonical(
    variable: str,
    unit: str,
    values: list[float | None],
    start: date,
    end: date,
    source: str,
    product: str,
    resolution: float,
    method: str,
) -> dict[str, Any]:
    return CanonicalSeries.model_validate(
        {
            "var": variable,
            "unit": unit,
            "cadence": "daily",
            "start": start,
            "values": values,
            "quality": [2 if x is None else 0 for x in values],
            "provenance": {
                "source": source,
                "product": product,
                "version": "snapshot",
                "resolution_m": resolution,
                "period": {"start": start, "end": end},
                "quality": "medium",
                "method": method,
                "retrieved": date.today(),
            },
        }
    ).model_dump(mode="json", exclude_none=True)


def power_series(raw: object, start: date, end: date) -> list[dict[str, Any]]:
    parameters = PowerResponse.model_validate(raw).properties.parameter
    result = []
    for name, variable, unit in (
        ("T2M_MAX", "tmax", "degC"),
        ("T2M_MIN", "tmin", "degC"),
        ("T2M", "tmean", "degC"),
        ("RH2M", "rh", "%"),
        ("WS2M", "wind2m", "m/s"),
        ("ALLSKY_SFC_SW_DWN", "srad", "MJ/m2/day"),
        ("PRECTOTCORR", "precip", "mm/day"),
    ):
        values = [parameters.get(name, {}).get(d.strftime("%Y%m%d")) for d in dates(start, end)]
        values = [v if v is not None and np.isfinite(v) and v > -999 else None for v in values]
        result.append(
            canonical(
                variable,
                unit,
                values,
                start,
                end,
                "nasa_power_daily",
                "NASA POWER daily point",
                55000,
                "Nearest regional cell; UTC daily values; no gap interpolation",
            )
        )
    return result


def modis_series(ndvi: list[object], qa: list[object], start: date, end: date) -> dict[str, Any]:
    flags = {r.calendar_date: r.data[0] for part in qa for r in Subset.model_validate(part).subset}
    observed: dict[date, float] = {}
    for part in ndvi:
        for record in Subset.model_validate(part).subset:
            value = record.data[0]
            if flags.get(record.calendar_date) == 0 and -2000 <= value <= 10000:
                observed[record.calendar_date] = value * 0.0001
    return canonical(
        "ndvi",
        "1",
        [observed.get(d) for d in dates(start, end)],
        start,
        end,
        "ornl_mod13q1",
        "MOD13Q1 Collection 6.1",
        250,
        "Single native pixel at field centroid; pixel reliability=0; "
        "16-day composites on acquisition date only; not a field-resolution map",
    )


def cdl_label(payload: bytes, hero: Hero, year: int) -> dict[str, Any]:
    """Categorical field-pixel histogram; unsupported classes stay 'other', never crop."""
    with MemoryFile(payload) as memory, memory.open() as raster:
        if raster.crs is None or raster.count != 1:
            raise ValueError("CDL must be a georeferenced single-band categorical raster")
        polygon = transform_geom("EPSG:4326", raster.crs, hero.geometry.model_dump())
        mask = geometry_mask(
            [polygon], out_shape=raster.shape, transform=raster.transform, invert=True
        )
        values = raster.read(1, masked=True)
        valid = mask & ~np.ma.getmaskarray(values) & (values.data != 0)
        codes, counts = np.unique(values.data[valid], return_counts=True)
        if not len(codes):
            raise ValueError("CDL has no valid field pixels")
        histogram = {str(int(c)): int(n) for c, n in zip(codes, counts, strict=True)}
        # USDA class 61 = fallow/idle cropland; 1–60 contain crop classes.
        crop = sum(n for c, n in histogram.items() if 1 <= int(c) <= 60)
        fallow = histogram.get("61", 0)
        other = int(counts.sum()) - crop - fallow
        tally = {"crop": crop, "fallow": fallow, "other": other}
        winners = [key for key, value in tally.items() if value == max(tally.values())]
        label = winners[0] if len(winners) == 1 else "mixed"
        return {
            "season": str(year),
            "label": label,
            "histogram": histogram,
            "pixels": int(counts.sum()),
            "fraction": max(tally.values()) / int(counts.sum()),
            "provenance": {
                "source": "USDA NASS Cropland Data Layer",
                "version": str(year),
                "resolution_m": 10 if year >= 2024 else 30,
                "period": {"start": f"{year}-01-01", "end": f"{year}-12-31"},
                "method": "Nearest-neighbor 30 m categorical export; centers in sampling polygon; "
                "modal crop/fallow/other, ties mixed; not surveyed ground truth",
                "sha256": digest(payload),
            },
        }


def et0(day: date, lat: float, low: float, high: float) -> float:
    """Same FAO-56 Hargreaves approximation used to train the stress model."""
    phi = np.deg2rad(lat)
    angle = 2 * np.pi * day.timetuple().tm_yday / 365
    declination = 0.409 * np.sin(angle - 1.39)
    sunset = np.arccos(np.clip(-np.tan(phi) * np.tan(declination), -1, 1))
    ra = (
        24
        * 60
        / np.pi
        * 0.0820
        * (1 + 0.033 * np.cos(angle))
        * (
            sunset * np.sin(phi) * np.sin(declination)
            + np.cos(phi) * np.cos(declination) * np.sin(sunset)
        )
    )
    return max(
        0.0,
        float(0.0023 * ((low + high) / 2 + 17.8) * np.sqrt(high - low) * 0.408 * ra),
    )


def predict_seasons(
    bundle: FieldBundle, start: date, end: date, model: StressModel
) -> dict[str, Any]:
    series = {s.var.value: s for s in bundle.series}

    def at(variable: str, day: date) -> float | None:
        s = series.get(variable)
        if s is None:
            return None
        index = (day - s.start).days
        return s.values[index] if 0 <= index < len(s.values) else None

    predictions = []
    for year in range(start.year, end.year + 1):
        season = dates(date(year, 1, 1), date(year, 6, 30))
        days = []
        for d in season:
            rain, low, high = at("precip", d), at("tmin", d), at("tmax", d)
            if rain is None or low is None or high is None or d < start or d > end:
                break
            stages: tuple[Literal["initial", "development", "mid", "late"], ...] = (
                "initial",
                "development",
                "mid",
                "late",
            )
            days.append(
                Day(
                    date=d,
                    stage=stages[min(3, (d.timetuple().tm_yday - 1) // 46)],
                    rain_mm=rain,
                    et0_mm=et0(d, bundle.field.centroid[1], low, high),
                    tmin_c=low,
                    tmax_c=high,
                )
            )
        if len(days) != len(season):
            predictions.append(
                {
                    "season": str(year),
                    "prediction": None,
                    "gap": "Incomplete January–June weather; no prediction",
                }
            )
            continue
        previous = [at("ndvi", d) for d in dates(date(year - 1, 1, 1), date(year - 1, 6, 30))]
        peaks = [value for value in previous if value is not None]
        payload = StressRequest(
            features=build_features(
                days,
                previous_peak_ndvi=max(peaks) if len(peaks) >= 6 else None,
                slope_deg=bundle.field.slope_mean_deg,
            ),
            provenance=[
                MLSource(
                    source="NASA POWER daily / ORNL MOD13Q1",
                    resolution="55 km weather / 250 m NDVI",
                    period=f"{year}-01–06",
                )
            ],
        )
        response = model.predict(payload).model_dump(mode="json")
        predictions.append({"season": str(year), **response})
    return {
        "seasons": predictions,
        "method": "Fixed January–June winter-cereal windows, matching model training; "
        "Hargreaves ET0; missing covariates follow model missing-value path; not yield",
    }


class Source(Protocol):
    async def part(
        self, name: str, hero: Hero, start: date, end: date, directory: Path
    ) -> dict[str, Any]: ...


class ClippedReader(EarthaccessGranuleReader):
    """Batch-only reader: range-read native windows instead of downloading global files.

    Retains the existing service's authenticated/serialized search and scientific readers.
    HLS is sampled evenly (up to 12 scenes per collection over the spatial window).
    """

    def _download(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date | Period | None,
    ) -> list[Granule]:
        if short_name in {"NASADEM_HGT", "SRTMGL1"}:
            return super()._download(short_name, version, bbox, day)
        import earthaccess

        if not earthaccess.login(strategy="environment", persist=False).authenticated:
            raise GranuleAccessError("Earthdata authentication failed")
        period = day if isinstance(day, Period) else Period(day, day) if day else None
        query: dict[str, Any] = {
            "short_name": short_name,
            "version": version,
            "bounding_box": bbox,
            "count": 513,
        }
        if period:
            query["temporal"] = (str(period.start), str(period.end))
        results = earthaccess.search_data(**query)
        if len(results) > 512:
            raise GranuleAccessError("batch search exceeds the source budget")
        if short_name.endswith("_VI") and len(results) > 12:
            results = [results[int(i)] for i in np.linspace(0, len(results) - 1, 12)]
        granules = []
        self._download_dir.mkdir(parents=True, exist_ok=True)
        for result in results:
            observed = date.fromisoformat(
                str(result["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"])[:10]
            )
            if period and not period.start <= observed <= period.end:
                continue
            paths = []
            for url in result.data_links(access="external"):
                if not url.lower().endswith((".ndvi.tif", ".fmask.tif", ".nc4", ".h5")):
                    continue
                key = digest(json.dumps({"url": url, "bbox": bbox}, sort_keys=True).encode())
                path = self._download_dir / (key + Path(url).suffix)
                if not path.exists():
                    handles = earthaccess.open([url], open_kwargs={"cache_type": "blockcache"})
                    with closing(handles[0]) as handle:
                        self.clip(handle, path, bbox, short_name)
                paths.append((url, path))
            qa = next((p for u, p in paths if u.lower().endswith(".fmask.tif")), None)
            primary = next((p for _, p in paths if p != qa), None)
            if primary:
                granules.append(Granule(primary, observed, qa))
        return granules

    @staticmethod
    def clip(
        handle: Any, path: Path, bbox: tuple[float, float, float, float], product: str
    ) -> None:
        from rasterio.warp import transform_bounds
        from rasterio.windows import Window, from_bounds

        temporary = path.with_suffix(".tmp")
        if product.endswith("_VI"):
            with rasterio.open(handle) as src:
                bounds = transform_bounds(4326, src.crs, *bbox)
                win = from_bounds(*bounds, transform=src.transform)
                left, top = int(np.floor(win.col_off)) - 1, int(np.floor(win.row_off)) - 1
                win = Window(left, top, int(np.ceil(win.width)) + 3, int(np.ceil(win.height)) + 3)
                win = win.intersection(Window(0, 0, src.width, src.height))
                profile = src.profile.copy()
                profile.update(
                    driver="GTiff",
                    height=int(win.height),
                    width=int(win.width),
                    transform=src.window_transform(win),
                    tiled=False,
                )
                profile.pop("blockxsize", None)
                profile.pop("blockysize", None)
                with rasterio.open(temporary, "w", **profile) as dst:
                    dst.write(src.read(window=win))
                    dst.scales, dst.offsets = src.scales, src.offsets
        elif product == "SPL4SMGP":
            with h5py.File(handle) as src, h5py.File(temporary, "w") as dst:
                lat = src["cell_lat"][:, 0]
                lon = src["cell_lon"][0, :]
                rows = np.flatnonzero((lat >= bbox[1] - 0.12) & (lat <= bbox[3] + 0.12))
                cols = np.flatnonzero((lon >= bbox[0] - 0.12) & (lon <= bbox[2] + 0.12))
                if not len(rows) or not len(cols):
                    raise ValueError("no native SMAP window")
                window = (
                    slice(int(rows.min()), int(rows.max()) + 1),
                    slice(int(cols.min()), int(cols.max()) + 1),
                )
                for name in (
                    "cell_lat",
                    "cell_lon",
                    "Geophysical_Data/sm_surface",
                    "Geophysical_Data/sm_rootzone",
                ):
                    item = dst.create_dataset(name, data=src[name][window])
                    for key, value in src[name].attrs.items():
                        if key not in {"DIMENSION_LIST", "REFERENCE_LIST", "CLASS", "NAME"}:
                            item.attrs[key] = value
        else:
            with xr.open_dataset(handle, engine="h5netcdf", decode_cf=False) as src:
                lon, lat = np.asarray(src.lon), np.asarray(src.lat)
                xs = np.flatnonzero((lon >= bbox[0] - 0.15) & (lon <= bbox[2] + 0.15))
                ys = np.flatnonzero((lat >= bbox[1] - 0.15) & (lat <= bbox[3] + 0.15))
                if not len(xs) or not len(ys):
                    raise ValueError("no native IMERG window")
                src[["precipitation"]].isel(
                    lon=slice(int(xs.min()), int(xs.max()) + 1),
                    lat=slice(int(ys.min()), int(ys.max()) + 1),
                ).load().to_netcdf(temporary, engine="h5netcdf")
        temporary.replace(path)


class LiveSource:
    def __init__(self, state: Any, archive: Archive, server_days: int) -> None:
        self.state, self.archive, self.server_days = state, archive, server_days

    async def part(
        self, name: str, hero: Hero, start: date, end: date, directory: Path
    ) -> dict[str, Any]:
        if name == "browser":
            return await asyncio.to_thread(self.browser, hero, start, end)
        if name == "cdl":
            return await asyncio.to_thread(self.cdl, hero, start, end)
        if name == "server":
            request = BundleRequest(
                geometry=hero.geometry,
                period=PeriodInput(
                    start=max(start, end - timedelta(days=self.server_days - 1)),
                    end=end,
                ),
            )
            bundle = await _build_bundle(
                request,
                field_id(hero.geometry),
                SUPPORTED_VARS,
                self.state.bundle_adapters,
            )
            await _add_terrain(bundle, self.state.spatial)
            return bundle.model_dump(mode="json", by_alias=True)
        if name == "spatial":
            return await self.spatial(hero, start, end, directory)
        if name == "context":
            return await self.context(hero, start, end, directory)
        raise ValueError(f"unknown source stage {name}")

    def browser(self, hero: Hero, start: date, end: date) -> dict[str, Any]:
        point = to_shapely(hero.geometry).centroid
        params: dict[str, str | int | float] = {
            "latitude": point.y,
            "longitude": point.x,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "parameters": "T2M_MAX,T2M_MIN,T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR",
            "community": "AG",
            "format": "JSON",
            "time-standard": "UTC",
        }
        raw = self.archive.json(POWER, params)
        result = power_series(raw, start, end)
        available = Dates.model_validate(
            self.archive.json(
                ORNL + "/dates",
                {
                    "latitude": point.y,
                    "longitude": point.x,
                },
            )
        )
        observed = [d for d in available.dates if start <= d.calendar_date <= end]
        bands: list[list[object]] = []
        for band in ("250m_16_days_NDVI", "250m_16_days_pixel_reliability"):
            parts: list[object] = []

            def fetch(i: int, band: str = band) -> dict[str, Any]:
                chunk = observed[i : i + 10]
                return self.archive.json(
                    ORNL + "/subset",
                    {
                        "latitude": point.y,
                        "longitude": point.x,
                        "band": band,
                        "startDate": chunk[0].modis_date,
                        "endDate": chunk[-1].modis_date,
                        "kmAboveBelow": 0,
                        "kmLeftRight": 0,
                    },
                )

            with ThreadPoolExecutor(max_workers=8) as pool:
                parts.extend(pool.map(fetch, range(0, len(observed), 10)))
            bands.append(parts)
        result.append(modis_series(bands[0], bands[1], start, end))
        return {"series": result}

    def cdl(self, hero: Hero, start: date, end: date) -> dict[str, Any]:
        if hero.role != "proof":
            return {
                "labels": [],
                "gaps": ["CDL does not cover Algeria; farmer confirmation required"],
            }
        labels = []
        bounds = to_shapely(hero.geometry).bounds
        for year in range(max(2008, start.year), min(2023, end.year) + 1):
            # Snap export to the source Albers grid using native pixels (no display color map).
            from rasterio.warp import transform_bounds

            w, s, e, n = transform_bounds("EPSG:4326", "EPSG:5070", *bounds)
            params: dict[str, str | int | float] = {
                "bbox": f"{w - 30},{s - 30},{e + 30},{n + 30}",
                "bboxSR": 5070,
                "imageSR": 5070,
                "size": f"{int(np.ceil((e - w + 60) / 30))},{int(np.ceil((n - s + 60) / 30))}",
                "adjustAspectRatio": "false",
                "format": "tiff",
                "pixelType": "U8",
                "noData": 0,
                "interpolation": "RSP_NearestNeighbor",
                "f": "image",
                "mosaicRule": json.dumps(
                    {
                        "where": f"Year = {year}",
                        "mosaicMethod": "esriMosaicAttribute",
                        "sortField": "Year",
                        "sortValue": str(year),
                    }
                ),
                "renderingRule": json.dumps({"rasterFunction": "None"}),
            }
            payload = self.archive.get(CDL, params)
            labels.append(cdl_label(payload, hero, year))
        if len(labels) < 15:
            raise ValueError("proof fields require at least 15 observed CDL seasons")
        return {
            "labels": labels,
            "gaps": [],
            "coverage_note": "CDL is a remote-sensing reference label, not farmer-confirmed truth",
        }

    async def spatial(self, hero: Hero, start: date, end: date, directory: Path) -> dict[str, Any]:
        spatial = self.state.spatial
        terrain = await spatial.terrain(hero.geometry)
        key = field_id(hero.geometry).removeprefix("sha256:")
        for variable, filename in terrain.layers.items():
            destination = "assets/terrain/" + Path(filename).name
            copy_asset(spatial.asset("terrain-" + key, filename), directory / destination)
            terrain.layers[variable] = destination
        period = Period(max(start, date(end.year - 1, 1, 1)), end)
        zones = await spatial.management_zones(hero.geometry, period, None, False)
        # Frame service uses the NDVI series period: construct only its requested two-year window.
        bundle = await _build_bundle(
            BundleRequest(
                geometry=hero.geometry,
                period=PeriodInput(start=period.start, end=period.end),
            ),
            field_id(hero.geometry),
            (),
            [],
        )
        self.state.cache.set(
            "bundle-period",
            key,
            {"start": period.start.isoformat(), "end": period.end.isoformat()},
        )
        frames = await spatial.frame_index(key, bundle, False)
        for frame in frames.frames:
            filename = frame.href.rsplit("/", 1)[-1]
            destination = "assets/frames/" + filename
            copy_asset(spatial.asset("frames-" + key, filename), directory / destination)
            frame.href = destination
        frames.gaps.append(
            Gap(
                var="ndvi",
                reason=(
                    "Batch HLS sampling: up to 12 evenly spaced scenes per collection "
                    "over the two-year spatial window"
                ),
                severity="info",
            )
        )
        return {
            "terrain": terrain.model_dump(mode="json"),
            "zones": zones.model_dump(mode="json"),
            "frames": frames.model_dump(mode="json"),
        }

    async def context(self, hero: Hero, start: date, end: date, directory: Path) -> dict[str, Any]:
        context = self.state.context
        bounds = to_shapely(hero.geometry).bounds
        point = to_shapely(hero.geometry).centroid
        query = SceneQuery.model_validate(
            {
                "bbox": ",".join(map(str, bounds)),
                "from": max(start, date(end.year, 1, 1)),
                "to": end,
                "limit": 2,
            }
        )
        output: dict[str, Any] = {}
        # Private compute methods are the service's batch entry points: no pending responses.
        for kind in ("nisar", "ecostress"):
            result = await context._scenes(kind, query)
            for scene in result.scenes:
                filename = scene.href.rsplit("/", 1)[-1]
                destination = "assets/context/" + filename
                copy_asset(context.asset(filename), directory / destination)
                scene.href = destination
            output[kind] = result.model_dump(mode="json")
        for kind in ("grace", "gedi"):
            try:
                if kind == "grace":
                    output[kind] = (
                        await context._grace(PointQuery(lat=point.y, lon=point.x))
                    ).model_dump(mode="json")
                else:
                    output[kind] = (
                        await context._gedi(GediQuery(bbox=query.bbox, limit=2))
                    ).model_dump(mode="json")
            except Exception:  # noqa: BLE001 -- match the service context failure boundary
                output[kind] = {
                    "status": "empty",
                    "gaps": ["Source unavailable; no observations substituted"],
                }
        return output


def copy_asset(source: Path, destination: Path) -> None:
    if source.suffix == ".png" and source.stat().st_size > MAX_FRAME_BYTES:
        raise ValueError("frame exceeds 150 KB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def check_assets(directory: Path) -> dict[str, str]:
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    if sum(p.stat().st_size for p in files) > MAX_FIELD_BYTES:
        raise ValueError("hero bundle exceeds 5 MB")
    if any(p.suffix == ".png" and p.stat().st_size > MAX_FRAME_BYTES for p in files):
        raise ValueError("frame exceeds 150 KB")
    return {str(p.relative_to(directory)): digest(p.read_bytes()) for p in files}


def merge_bundle(server: dict[str, Any], browser: dict[str, Any]) -> FieldBundle:
    bundle = FieldBundle.model_validate(server)
    # Full historical browser inputs remain primary. Server source series are kept separately,
    # so short native clips never accidentally truncate the replay's daily forcing.
    bundle.series = [CanonicalSeries.model_validate(s) for s in browser["series"]] + [
        s
        for s in bundle.series
        if s.var.value in ("elevation", "slope", "sm_surface", "sm_rootzone")
    ]
    if not any(
        s.var.value == "ndvi" and any(v is not None for v in s.values) for s in bundle.series
    ):
        raise ValueError("hero has no observed NDVI")
    return bundle


def bundle_document(bundle: FieldBundle) -> dict[str, Any]:
    """Generated models permit optional nulls the JSON Schema forbids when present."""
    document = bundle.model_dump(mode="json", by_alias=True, exclude_none=True)
    document["field"].update(
        elevation_m=bundle.field.elevation_m, slope_mean_deg=bundle.field.slope_mean_deg
    )
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    registry: Registry[Any] = Registry()
    for path in (ROOT / "schemas").glob("*.schema.json"):
        schema = json.loads(path.read_text())
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    schema = json.loads((ROOT / "schemas/field-bundle.schema.json").read_text())
    Draft202012Validator(schema, registry=registry).validate(document)
    return document


async def build_field(
    hero: Hero,
    start: date,
    end: date,
    source: Source,
    model: StressModel,
    work: Path,
    output: Path,
    *,
    refresh: bool = False,
    identity: str = "fixture",
) -> dict[str, Any]:
    config = {
        "hero": hero.model_dump(mode="json"),
        "start": str(start),
        "end": str(end),
        "identity": identity,
        "code": digest(Path(__file__).read_bytes()),
    }
    fingerprint = digest(json.dumps(config, sort_keys=True).encode())
    checkpoint = work / hero.id / fingerprint
    checkpoint.mkdir(parents=True, exist_ok=True)
    parts = {}
    for stage in ("browser", "server", "spatial", "context", "cdl"):
        path = checkpoint / (stage + ".json")
        if path.exists() and not refresh:
            parts[stage] = json.loads(path.read_text())
            LOG.info("%s %s: resumed", hero.id, stage)
        else:
            parts[stage] = await source.part(stage, hero, start, end, checkpoint)
            write_json(path, parts[stage])
            LOG.info("%s %s: captured", hero.id, stage)
    bundle = merge_bundle(parts["server"], parts["browser"])
    bundle.layers.ndvi_frames = "frames.json"
    bundle.layers.zones = "zones.json"
    # History labels are not derived from CDL; the engine consumes NDVI and performs Field Memory.
    bundle.gaps.append(
        Gap(
            var="phenology",
            reason=(
                "Field Memory runs in the browser engine from the observed NDVI series; "
                "CDL is independent reference data"
            ),
            severity="info",
        )
    )
    bundle.gaps.append(
        Gap(
            var="soil",
            reason="No field soil test is supplied; region-pack estimates need local confirmation",
            severity="info",
        )
    )
    bundle.gaps.append(
        Gap(
            var="server_history",
            reason=(
                "Native server observations cover only the period in server.json; "
                "historical replay uses POWER weather and MODIS NDVI"
            ),
            severity="info",
        )
    )
    for product in ("terrain", "zones", "frames"):
        for gap in parts["spatial"][product].get("gaps", []):
            bundle.gaps.append(Gap.model_validate(gap))
    for product, response in parts["context"].items():
        for gap in response.get("gaps", []):
            bundle.gaps.append(Gap(var=product, reason=str(gap), severity="info"))
    bundle = FieldBundle.model_validate(bundle.model_dump(mode="json", by_alias=True))
    predictions = predict_seasons(bundle, start, end, model)
    labels = parts["cdl"]["labels"]
    if hero.role == "proof" and len({x["season"] for x in labels}) < 15:
        raise ValueError("proof field requires 15 distinct CDL seasons")
    products = {
        "bundle.json": bundle_document(bundle),
        "server.json": parts["server"],
        "context.json": parts["context"],
        "terrain.json": parts["spatial"]["terrain"],
        "zones.json": parts["spatial"]["zones"],
        "frames.json": parts["spatial"]["frames"],
        "cdl.json": parts["cdl"],
        "ml.json": predictions,
        "field.json": hero.model_dump(mode="json"),
    }
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output, prefix=".publish-") as tmp:
        staging = Path(tmp)
        assets = checkpoint / "assets"
        if assets.exists():
            shutil.copytree(assets, staging / "assets")
        for name, value in products.items():
            write_json(staging / name, value)
        hashes = check_assets(staging)
        record = {
            "version": "hero-build/1",
            "fingerprint": fingerprint,
            "files": hashes,
            "config": config,
        }
        write_json(staging / "provenance.json", record)
        check_assets(staging)
        destination = output / hero.id
        # Existing publication stays intact until every source, contract and budget passes.
        backup = output / ("." + hero.id + ".previous")
        if backup.exists():
            shutil.rmtree(backup)
        if destination.exists():
            destination.rename(backup)
        try:
            staging.rename(destination)
        except OSError:
            if backup.exists():
                backup.rename(destination)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    LOG.info("%s published: %s", hero.id, fingerprint)
    return record


async def run(args: argparse.Namespace) -> None:
    manifest = Manifest.model_validate(yaml.safe_load(args.fields.read_text()))
    settings = Settings(
        _env_file=ROOT / "services/science-api/.env", data_dir=args.cache / "service"
    )
    app = create_app(settings)
    model = StressModel(ROOT / "services/science-api/models/stress-v1")
    if model.metadata.status != "trained":
        raise ValueError("publication requires a trained model")
    identity = digest((ROOT / "services/science-api/models/stress-v1/model.txt").read_bytes())
    async with app.router.lifespan_context(app):
        original = app.state.spatial.source.reader
        reader = ClippedReader(args.cache / "clips", credentials=original._credentials)
        for adapter in app.state.bundle_adapters:
            adapter._reader = reader
        app.state.spatial.source.reader = reader
        source = LiveSource(app.state, Archive(args.cache / "raw"), args.server_days)
        for hero in manifest.fields:
            if args.only and hero.id not in args.only:
                continue
            await build_field(
                hero,
                manifest.period["start"],
                manifest.period["end"],
                source,
                model,
                args.cache / "work",
                args.output,
                refresh=args.refresh,
                identity=f"{identity}:server-days={args.server_days}",
            )
    write_json(args.output / "index.json", manifest.model_dump(mode="json"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fields", type=Path, default=ROOT / "pipelines/hero_fields.yaml")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "apps/web/public/bundles")
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--server-days", type=int, default=7)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.server_days <= 365:
        parser.error("server-days must be between 1 and 365")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
