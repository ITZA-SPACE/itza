"""Bounded spatial work, cached derived assets and provenance for service routes."""

import asyncio
import hashlib
import os
from datetime import date
from pathlib import Path

import numpy as np
from rasterio.io import MemoryFile

from itza_science.adapters.base import Period
from itza_science.cache.files import FileCache
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.field_bundle_schema import FieldBundle
from itza_science.core.field import Geometry, area_ha, field_id, to_shapely
from itza_science.terrain.derivatives import Terrain, derive, flow_lines
from itza_science.terrain.grid import Grid
from itza_science.terrain.images import encode
from itza_science.terrain.models import (
    Frame,
    FrameIndex,
    SoilBaseline,
    TerrainIndex,
    ZoneCollection,
)
from itza_science.terrain.sources import SpatialSource, gap
from itza_science.terrain.zoning import zones

VERSION = "spatial/1"


class SpatialService:
    def __init__(self, root: Path, source: SpatialSource) -> None:
        self.root = root
        self.cache = FileCache(root)
        self.source = source
        self.lock = asyncio.Lock()

    def asset(self, group: str, name: str) -> Path:
        return self.root / "spatial-assets" / group / name

    def _store(self, group: str, payload: bytes, suffix: str) -> str:
        name = hashlib.sha256(payload).hexdigest() + suffix
        path = self.asset(group, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_bytes(payload)
        temporary.replace(path)
        return name

    async def _terrain(self, geometry: Geometry, href_base: str = "") -> TerrainIndex:
        field_key = field_id(geometry).removeprefix("sha256:")
        key = FileCache.key("terrain", VERSION, {"field": field_key})
        cached = self.cache.get("terrain-index", key)
        if cached is not None:
            result = TerrainIndex.model_validate(cached)
            # Store relative asset names; routes supply their own stable URL base.
            result.layers = {k: href_base + v for k, v in result.layers.items()}
            return result
        grid = Grid.for_field(to_shapely(geometry))
        inputs = await self.source.dem(grid)
        if inputs.elevation is None or inputs.dem_source is None:
            return TerrainIndex(available=False, gaps=inputs.gaps)
        products = await asyncio.to_thread(derive, inputs.elevation)
        mask = grid.mask
        valid = mask & np.isfinite(products.elevation) & np.isfinite(products.slope)
        if not valid.any():
            return TerrainIndex(
                available=False, gaps=[gap("terrain", "DEM has no valid field pixels")]
            )
        if int(valid.sum()) < int(mask.sum()):
            inputs.gaps.append(
                gap("terrain", "DEM voids and invalid gradients are excluded from field means")
            )
        result = TerrainIndex(
            available=True,
            mean_elevation_m=float(np.mean(products.elevation[valid])),
            mean_slope_deg=float(np.mean(products.slope[valid])),
            bounds=grid.bounds,
            provenance=inputs.dem_source,
            gaps=inputs.gaps,
            flow_lines=flow_lines(products, grid),
        )
        inputs.dem_source.method += (
            "; metric gradients; unfilled local D8; 5-cell topographic position; "
            "slope classes 0-2/2-5/5-10/10+ degrees"
        )
        for variable in (
            "elevation",
            "slope",
            "aspect",
            "accumulation",
            "slope_class",
            "concavity",
        ):
            values = getattr(products, variable)
            with MemoryFile() as memory:
                with memory.open(
                    driver="GTiff",
                    height=grid.height,
                    width=grid.width,
                    count=1,
                    dtype="float32",
                    crs=grid.crs,
                    transform=grid.affine,
                    nodata=np.nan,
                    compress="deflate",
                ) as dataset:
                    dataset.write(np.where(mask, values, np.nan).astype("float32"), 1)
                filename = self._store("terrain-" + field_key, memory.read(), ".tif")
            result.layers[variable] = filename
            if variable != "elevation":
                payload, _, _, bounds = await asyncio.to_thread(encode, values, grid, variable)
                result.layers[variable + "_png"] = self._store(
                    "terrain-" + field_key, payload, ".png"
                )
                result.display_bounds = bounds
        self.cache.set("terrain-index", key, result.model_dump(mode="json"))
        result.layers = {k: href_base + v for k, v in result.layers.items()}
        return result

    async def _frame_index(self, bundle_id: str, bundle: FieldBundle, refresh: bool) -> FrameIndex:
        key = FileCache.key(
            "frames",
            VERSION,
            {
                "id": bundle_id,
                "generated": bundle.generated_at.isoformat(),
                "as_of": date.today().isoformat(),
            },
        )
        cached = self.cache.get("frame-index", key)
        if cached is not None and not refresh:
            return FrameIndex.model_validate(cached)
        series = next((s for s in bundle.series if s.var.value == "ndvi"), None)
        stored_period = self.cache.get("bundle-period", bundle_id)
        if series is not None:
            source_period = series.provenance.period
        elif stored_period is not None:
            source_period = SourcePeriod.model_validate(stored_period)
        else:
            return FrameIndex(gaps=[gap("ndvi", "bundle has no observation period to render")])
        grid = Grid.for_field(to_shapely(bundle.field.geometry))
        period = Period(source_period.start, source_period.end)
        inputs = await self.source.series(grid, period, bundle.field.id.removeprefix("sha256:"))
        result = FrameIndex(gaps=inputs.gaps)
        for observation in sorted(
            inputs.observations, key=lambda o: (o.day, o.variable, o.source.product)
        ):
            if not np.isfinite(observation.values[grid.mask]).any():
                result.gaps.append(
                    gap(observation.variable, f"no valid frame pixels on {observation.day}")
                )
                continue
            payload, width, height, bounds = await asyncio.to_thread(
                encode, observation.values, grid, observation.variable
            )
            filename = self._store("frames-" + bundle_id, payload, ".png")
            result.frames.append(
                Frame(
                    date=observation.day,
                    variable=observation.variable,
                    href=f"/v1/bundles/{bundle_id}/frames/{filename}",
                    bounds=bounds,
                    source=observation.source,
                    width=width,
                    height=height,
                    bytes=len(payload),
                )
            )
        self.cache.set("frame-index", key, result.model_dump(mode="json"))
        return result

    async def _management_zones(
        self, geometry: Geometry, period: Period, soil: SoilBaseline | None, refresh: bool
    ) -> ZoneCollection:
        shape = to_shapely(geometry)
        if area_ha(shape) < 3:
            return ZoneCollection(
                enabled=False, reason="management zones require at least 3 hectares"
            )
        grid = Grid.for_field(shape)
        if int(grid.mask.sum()) < 30:
            return ZoneCollection(
                enabled=False, reason="management zones require at least 30 HLS pixels"
            )
        field_key = field_id(geometry).removeprefix("sha256:")
        key = FileCache.key(
            "zones",
            VERSION,
            {
                "field": field_key,
                "start": period.start.isoformat(),
                "end": period.end.isoformat(),
                "soil": soil.model_dump() if soil else None,
                "as_of": date.today().isoformat(),
            },
        )
        cached = self.cache.get("zones", key)
        if cached is not None and not refresh:
            return ZoneCollection.model_validate(cached)
        # A worker serializes spatial requests; CPU work runs off the event loop.
        inputs = await self.source.series(grid, period, field_key)
        dem = await self.source.dem(grid)
        inputs.elevation, inputs.dem_source = dem.elevation, dem.dem_source
        inputs.gaps.extend(dem.gaps)
        terrain: Terrain | None = None
        if inputs.elevation is not None:
            terrain = await asyncio.to_thread(derive, inputs.elevation)
        result = await asyncio.to_thread(zones, grid, inputs, terrain, soil)
        self.cache.set("zones", key, result.model_dump(mode="json"))
        return result

    async def terrain(self, geometry: Geometry, href_base: str = "") -> TerrainIndex:
        async with self.lock:
            return await self._terrain(geometry, href_base)

    async def frame_index(self, bundle_id: str, bundle: FieldBundle, refresh: bool) -> FrameIndex:
        async with self.lock:
            return await self._frame_index(bundle_id, bundle, refresh)

    async def management_zones(
        self, geometry: Geometry, period: Period, soil: SoilBaseline | None, refresh: bool
    ) -> ZoneCollection:
        async with self.lock:
            return await self._management_zones(geometry, period, soil, refresh)
