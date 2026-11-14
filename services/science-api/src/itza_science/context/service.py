"""Cached context work, independent of the terrain/zone queue and bounded on cold reads."""

import asyncio
import hashlib
import time
from collections.abc import Awaitable, Callable
from datetime import date
from pathlib import Path
from statistics import fmean
from tempfile import NamedTemporaryFile

from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from itza_science.adapters.base import Period
from itza_science.adapters.context_archive import Archive, Scene, Search
from itza_science.adapters.granules import Granule
from itza_science.adapters.smap_l4 import _daily_mean
from itza_science.cache.files import FileCache
from itza_science.context.gedi import MAX_FOOTPRINTS, read_gedi
from itza_science.context.grace import read_grace, trend
from itza_science.context.models import (
    BBox,
    Comparison,
    Footprint,
    GediQuery,
    GediResponse,
    GraceResponse,
    PointQuery,
    SceneQuery,
    SceneResponse,
    Snapshot,
)
from itza_science.context.products import GRACE, NISAR, PRODUCTS
from itza_science.context.rasters import Raster, ecostress, nisar
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.terrain.grid import project
from itza_science.terrain.models import Model, Source


def proof(product: str, start: date, end: date, method: str) -> Source:
    version, resolution = PRODUCTS[product]
    return Source(
        source=product.lower(),
        product=product,
        version=version,
        resolution_m=resolution,
        period=SourcePeriod(start=start, end=end),
        method=method,
    )


def search(product: str, bounds: BBox, period: Period | None, limit: int) -> Search:
    return Search(product, PRODUCTS[product][0], bounds, period, limit)


class ContextService:
    def __init__(self, root: Path, archive: Archive, wait_seconds: float = 20) -> None:
        self.root, self.archive = root, archive
        self.cache = FileCache(root)
        self.wait_seconds = wait_seconds
        self.tasks: dict[str, asyncio.Task[Model]] = {}

    async def close(self) -> None:
        # Shielded source threads must finish before process shutdown; their temporary
        # directories are deleted by the archive even when processing raises.
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)

    async def _cached[T: Model](
        self,
        kind: str,
        params: dict[str, object],
        model: type[T],
        compute: Callable[[], Awaitable[T]],
        refresh: bool,
    ) -> T:
        key = FileCache.key(
            "context",
            "1",
            {
                "kind": kind,
                "params": params,
                "as_of": date.today().isoformat(),
                "products": PRODUCTS,
            },
        )
        await asyncio.to_thread(self.prune)
        cached = await asyncio.to_thread(self.cache.get, "context", key)
        if cached is not None and not refresh:
            result = model.model_validate(cached)
            if not isinstance(result, SceneResponse) or all(
                self.asset(s.href.rsplit("/", 1)[-1]).is_file() for s in result.scenes
            ):
                return result
        if key not in self.tasks:
            if len(self.tasks) >= 4:
                return model.model_validate(
                    {
                        "status": "pending",
                        "coverage_note": "Context workers are busy; retry this request shortly.",
                    }
                )

            async def run() -> Model:
                try:
                    result = await compute()
                    # Failures/empty coverage are retryable without a day-long failure cache.
                    if getattr(result, "status", None) == "ok" and not getattr(result, "gaps", []):
                        await asyncio.to_thread(
                            self.cache.set, "context", key, result.model_dump(mode="json")
                        )
                    return result
                except Exception:
                    return model.model_validate(
                        {
                            "status": "empty",
                            "coverage_note": "Context data unavailable; no inferred observations.",
                            "gaps": ["Source or local processing unavailable; retry later."],
                        }
                    )

            self.tasks[key] = asyncio.create_task(run())
            self.tasks[key].add_done_callback(lambda _: self.tasks.pop(key, None))
        try:
            completed = await asyncio.wait_for(asyncio.shield(self.tasks[key]), self.wait_seconds)
            return model.model_validate(completed.model_dump())
        except TimeoutError:
            return model.model_validate(
                {
                    "status": "pending",
                    "coverage_note": "Processing continues; retry the same request.",
                }
            )

    def asset(self, name: str) -> Path:
        return self.root / "context-assets" / name

    def prune(self) -> None:
        cutoff = time.time() - 7 * 86400
        for folder in (self.root / "context-assets", self.root / "cache" / "context"):
            for path in folder.glob("*"):
                try:
                    if path.is_file() and path.stat().st_mtime < cutoff:
                        path.unlink(missing_ok=True)
                except FileNotFoundError:
                    continue
        assets = []
        for path in self.asset("").glob("*.png"):
            try:
                stat = path.stat()
                assets.append((stat.st_mtime, stat.st_size, path))
            except FileNotFoundError:
                continue
        total = sum(size for _, size, _ in assets)
        for _, size, path in sorted(assets):
            if total <= 64 * 1024 * 1024:
                break
            total -= size
            path.unlink(missing_ok=True)

    def _store(self, payload: bytes) -> str:
        name = hashlib.sha256(payload).hexdigest() + ".png"
        path = self.asset(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as file:
            file.write(payload)
            temporary = Path(file.name)
        try:
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        self.prune()
        return "/v1/context/assets/" + name

    def _snapshot(
        self, raster: Raster, scene: Scene, field: BaseGeometry, variable: str, product: str
    ) -> Snapshot | None:
        unit = {"soil_moisture": "m3/m3", "esi": "1", "lst": "K"}[variable]
        statistics = raster.stats(field, unit)
        if statistics is None:
            return None
        stats, quality = statistics
        payload, bounds = raster.image(
            field, "moisture" if variable == "soil_moisture" else variable
        )
        source = proof(
            product, scene.day, scene.day, "Native pixel-overlap weighted mean; " + raster.policy
        )
        if product == NISAR:
            source.resolution_m = raster.grid.dlon
        return Snapshot.model_validate(
            {
                "date": scene.day,
                "scene_id": scene.id,
                "variable": variable,
                "stats": stats,
                "quality": quality,
                "provenance": source,
                "href": self._store(payload),
                "bounds": bounds,
                "bytes": len(payload),
                "provisional": product == NISAR,
            }
        )

    async def scenes(self, kind: str, query: SceneQuery) -> SceneResponse:
        return await self._cached(
            kind,
            query.model_dump(mode="json", exclude={"refresh"}),
            SceneResponse,
            lambda: self._scenes(kind, query),
            query.refresh,
        )

    async def _scenes(self, kind: str, query: SceneQuery) -> SceneResponse:
        field = box(*query.bounds())
        note = (
            (
                "Provisional, not fully calibrated NISAR SME2; nominal 200 m "
                "posting, potentially coarser effective resolution. SMAP is regional 9 km context."
            )
            if kind == "nisar"
            else (
                "Irregular clear-sky 70 m ECOSTRESS scenes; surface temperature "
                "is not air temperature; ESI is actual/potential ET."
            )
        )
        note += (
            f" Latest {query.limit} matching granules per collection; "
            "not exhaustive period coverage."
        )
        result = SceneResponse(coverage_note=note)
        start = max(query.start, date(2026, 6, 17)) if kind == "nisar" else query.start
        if start > query.end:
            result.gaps.append("No requested dates fall within the product observation period.")
            return result
        products = [NISAR] if kind == "nisar" else ["ECO_L2T_LSTE", "ECO_L4T_ESI"]
        for product in products:

            def decode(
                scenes: list[Scene], truncated: bool, product: str = product
            ) -> SceneResponse:
                decoded = SceneResponse(coverage_note=note, truncated=truncated)
                for scene in scenes:
                    try:
                        variable = (
                            "soil_moisture"
                            if product == NISAR
                            else "lst"
                            if product == "ECO_L2T_LSTE"
                            else "esi"
                        )
                        raster = (
                            nisar(next(iter(scene.assets.values())), field)
                            if product == NISAR
                            else ecostress(scene.assets, field, variable)
                        )
                        snapshot = (
                            self._snapshot(raster, scene, field, variable, product)
                            if raster
                            else None
                        )
                        if snapshot:
                            decoded.scenes.append(snapshot)
                    except Exception:
                        decoded.gaps.append(
                            f"{product}: one scene could not be decoded with required QA."
                        )
                return decoded

            try:
                decoded = await self.archive.read(
                    search(product, query.bounds(), Period(start, query.end), query.limit), decode
                )
                result.scenes.extend(decoded.scenes)
                result.gaps.extend(decoded.gaps)
                result.truncated |= decoded.truncated
            except Exception:
                result.gaps.append(f"{product}: source unavailable or credentials missing.")
        if kind == "nisar":
            comparisons = {
                day: await self._smap(day, query.bounds(), field)
                for day in {s.date for s in result.scenes}
            }
            for snapshot in result.scenes:
                snapshot.smap = comparisons[snapshot.date]
            if any(s.smap is not None and s.smap.value is None for s in result.scenes):
                result.gaps.append(
                    "Same-date SMAP comparison is unavailable for one or more scenes."
                )
        result.scenes.sort(key=lambda s: (s.date, s.variable, s.scene_id), reverse=True)
        result.status = "ok" if result.scenes else "empty"
        if not result.scenes:
            result.gaps.append("No valid field pixels in the sampled recent granules.")
        return result

    async def _smap(self, day: date, bounds: BBox, field: BaseGeometry) -> Comparison:
        result = Comparison(
            date=day,
            value=None,
            coverage_note="No same-date SMAP comparison is available; no nearest-day substitution.",
        )

        def decode(scenes: list[Scene], truncated: bool) -> tuple[float | None, int]:
            granules = [
                Granule(next(iter(s.assets.values())), s.day) for s in scenes if s.day == day
            ]
            return _daily_mean(granules, "sm_surface", field)

        try:
            value, count = await self.archive.read(
                search("SPL4SMGP", bounds, Period(day, day), 8), decode
            )
            if value is not None:
                result.value = value
                result.provenance = proof(
                    "SPL4SMGP",
                    day,
                    day,
                    "Area-weighted surface moisture; mean of available 3-hourly samples",
                )
                result.coverage_note = (
                    f"Regional 9 km modeled surface moisture; {count} of 8 daily samples available."
                )
        except Exception:
            result.coverage_note = "Same-date SMAP source unavailable; no value was substituted."
        return result

    async def grace(self, query: PointQuery) -> GraceResponse:
        return await self._cached(
            "grace",
            query.model_dump(exclude={"refresh"}),
            GraceResponse,
            lambda: self._grace(query),
            query.refresh,
        )

    async def _grace(self, query: PointQuery) -> GraceResponse:
        def decode(scenes: list[Scene], truncated: bool) -> GraceResponse:
            if not scenes:
                return GraceResponse()
            series = read_grace(next(iter(scenes[0].assets.values())), query.lat, query.lon)
            if not any(p.anomaly_cm is not None for p in series):
                return GraceResponse()
            slope = trend(series)
            source = proof(
                GRACE,
                series[0].date,
                series[-1].date,
                (
                    "Nearest 0.5 degree land cell; native anomaly baseline; optional "
                    "supplied gain applied; same-month solutions averaged; "
                    "OLS over observed months; "
                    "no interpolation or seasonal adjustment"
                ),
            )
            result = GraceResponse(
                status="ok",
                series=series,
                trend_cm_per_year=slope,
                period=source.period,
                provenance=source,
            )
            if slope is None:
                result.message = (
                    "Monthly regional water storage is available; too few months for a trend."
                )
                result.gaps.append(
                    "A trend requires at least 24 observed months spanning one year."
                )
            else:
                result.message = (
                    f"Regional total water storage changed by {slope:.2f} cm per year "
                    f"over {series[0].date.year}-{series[-1].date.year}; "
                    "this is not groundwater alone."
                )
            return result

        # GRACE's single granule contains the complete monthly time axis.
        return await self.archive.read(search(GRACE, (-180, -90, 180, 90), None, 1), decode)

    async def gedi(self, query: GediQuery) -> GediResponse:
        return await self._cached(
            "gedi",
            query.model_dump(exclude={"refresh"}),
            GediResponse,
            lambda: self._gedi(query),
            query.refresh,
        )

    async def _gedi(self, query: GediQuery) -> GediResponse:
        field = box(*query.bounds())
        crs = (
            f"+proj=aeqd +lat_0={field.centroid.y} +lon_0={field.centroid.x} +datum=WGS84 +units=m"
        )
        bounds = project(project(field, "EPSG:4326", crs).buffer(2000), crs, "EPSG:4326").bounds
        result = GediResponse()
        merged: dict[str, Footprint] = {}
        for product in ("GEDI02_A", "GEDI02_B"):

            def decode(
                scenes: list[Scene], truncated: bool, product: str = product
            ) -> GediResponse:
                output = GediResponse(truncated=truncated)
                for scene in scenes:
                    try:
                        footprints, limited = read_gedi(
                            next(iter(scene.assets.values())), field, product
                        )
                        output.features.extend(footprints)
                        output.truncated |= limited
                    except Exception:
                        output.gaps.append(
                            f"{product}: one granule failed required QA/format checks."
                        )
                return output

            try:
                decoded = await self.archive.read(
                    search(product, bounds, Period(date(2019, 1, 1), date.today()), query.limit),
                    decode,
                )
                result.truncated |= decoded.truncated
                result.gaps.extend(decoded.gaps)
                for feature in decoded.features:
                    previous = merged.get(feature.properties.shot_number)
                    if previous is None:
                        merged[feature.properties.shot_number] = feature
                    else:
                        if feature.properties.height_m is not None:
                            previous.properties.height_m = feature.properties.height_m
                        if feature.properties.cover_fraction is not None:
                            previous.properties.cover_fraction = feature.properties.cover_fraction
                        previous.properties.products = sorted(
                            set(previous.properties.products + feature.properties.products)
                        )
            except Exception:
                result.gaps.append(f"{product}: source unavailable or credentials missing.")
        result.features = sorted(
            merged.values(),
            key=lambda f: (f.properties.date, f.properties.shot_number),
            reverse=True,
        )[:MAX_FOOTPRINTS]
        result.truncated |= len(merged) > MAX_FOOTPRINTS
        self._gedi_summary(result)
        return result

    @staticmethod
    def _gedi_summary(result: GediResponse) -> None:
        if not result.features:
            return
        result.status = "ok"
        heights = [
            f.properties.height_m for f in result.features if f.properties.height_m is not None
        ]
        covers = [
            f.properties.cover_fraction
            for f in result.features
            if f.properties.cover_fraction is not None
        ]
        result.height_mean_m = fmean(heights) if heights else None
        result.cover_mean_fraction = fmean(covers) if covers else None
        result.on_field_count = sum(f.properties.on_field for f in result.features)
        if any(v >= 5 for v in heights):
            result.tree_structure_hint = (
                "Tall vegetation returns may indicate trees, orchards or "
                "windbreaks; sparse tracks cannot identify tree rows."
            )
        for product in ("GEDI02_A", "GEDI02_B"):
            dates = [f.properties.date for f in result.features if product in f.properties.products]
            if dates:
                result.provenance.append(
                    proof(
                        product,
                        min(dates),
                        max(dates),
                        (
                            "Quality flag=1, degrade=0, sensitivity 0.9-1; within 2 km; L2A "
                            "RH98 height / L2B cover; "
                            "on-field means 25 m footprint intersects field"
                        ),
                    )
                )
