"""Bounded spatial work, cached derived assets and provenance for service routes."""

import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from rasterio.io import MemoryFile

from itza_science.adapters.base import Period
from itza_science.cache.files import FileCache
from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.field_bundle_schema import FieldBundle, Gap
from itza_science.core.field import Geometry, area_ha, field_id, to_shapely
from itza_science.terrain.derivatives import Terrain, derive, flow_lines
from itza_science.terrain.grid import Grid
from itza_science.terrain.images import encode
from itza_science.terrain.models import (
    Frame,
    FrameIndex,
    Relief,
    SoilBaseline,
    TerrainIndex,
    ZoneCollection,
)
from itza_science.terrain.relief import encode_heights
from itza_science.terrain.relief_sources import (
    ImagerySource,
    ReliefInputs,
    ReliefSource,
    build_relief,
)
from itza_science.terrain.sources import SpatialSource, gap
from itza_science.terrain.zoning import zones

logger = logging.getLogger(__name__)

VERSION = "spatial/1"
RELIEF_VERSION = "relief/1"
HEIGHTMAP_MAX_BYTES = 2_500_000
IMAGERY_MAX_BYTES = 400_000


@dataclass(frozen=True)
class ReliefSources:
    """Where the fine 3D surface comes from: a primary source and the global picture fallback."""

    primary: ReliefSource
    imagery: ImagerySource


def fit_jpeg(jpeg: bytes, limit: int = IMAGERY_MAX_BYTES) -> bytes | None:
    """Re-encodes an oversized picture at falling quality; None when it cannot fit."""
    if len(jpeg) <= limit:
        return jpeg
    with Image.open(BytesIO(jpeg)) as image:
        picture = image.convert("RGB")
    for quality in (75, 60, 45, 30):
        out = BytesIO()
        picture.save(out, "JPEG", quality=quality)
        if out.tell() <= limit:
            return out.getvalue()
    return None


class SpatialService:
    def __init__(
        self, root: Path, source: SpatialSource, relief: ReliefSources | None = None
    ) -> None:
        self.root = root
        self.cache = FileCache(root)
        self.source = source
        self.relief_sources = relief
        self.lock = asyncio.Lock()
        # Relief waits on slow upstream exports; it must not hold up the 30 m products.
        self.relief_lock = asyncio.Lock()

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

    def _pack_relief(self, group: str, inputs: ReliefInputs) -> tuple[Relief, list[Gap]]:
        gaps = list(inputs.gaps)
        heightmap, low, high, holes = encode_heights(inputs.elevation)
        if len(heightmap) > HEIGHTMAP_MAX_BYTES:
            raise ValueError("relief height image exceeds the size limit")
        if holes:
            gaps.append(
                Gap.model_validate(
                    {
                        "var": "elevation",
                        "reason": f"{holes} cells without elevation were filled from neighbours",
                        "severity": "info",
                    }
                )
            )
        picture = fit_jpeg(inputs.imagery_jpeg) if inputs.imagery_jpeg else None
        return Relief(
            heightmap=self._store(group, heightmap, ".png"),
            imagery=self._store(group, picture, ".jpg") if picture else None,
            width=inputs.grid.width,
            height=inputs.grid.height,
            bounds=inputs.grid.bounds,
            size_m=inputs.grid.size_m,
            min_elevation_m=low,
            max_elevation_m=high,
            elevation_source=inputs.elevation_source,
            imagery_source=inputs.imagery_source if picture else None,
        ), gaps

    async def _relief(self, geometry: Geometry) -> tuple[Relief | None, list[Gap]]:
        if self.relief_sources is None:
            return None, []
        field_key = field_id(geometry).removeprefix("sha256:")
        key = FileCache.key("relief", RELIEF_VERSION, {"field": field_key})
        cached = self.cache.get("relief-index", key)
        if cached is not None:
            return Relief.model_validate(cached["relief"]), [
                Gap.model_validate(item) for item in cached["gaps"]
            ]
        try:
            inputs = await build_relief(
                to_shapely(geometry),
                self.relief_sources.primary,
                self.source,
                self.relief_sources.imagery,
            )
            if inputs is None:
                return None, [gap("relief", "no elevation source covers this field")]
            relief, gaps = await asyncio.to_thread(
                self._pack_relief, "terrain-" + field_key, inputs
            )
        except Exception:
            # The 3D surface is an extra: the 30 m terrain products must still be served.
            logger.exception("relief package failed")
            return None, [gap("relief", "the detailed 3D surface could not be built")]
        self.cache.set(
            "relief-index",
            key,
            {
                "relief": relief.model_dump(mode="json"),
                "gaps": [item.model_dump(mode="json") for item in gaps],
            },
        )
        return relief, gaps

    async def terrain(
        self, geometry: Geometry, href_base: str = "", *, relief: bool = False
    ) -> TerrainIndex:
        """The terrain index; `relief` adds the detailed 3D surface, fetched on first use."""
        async with self.lock:
            result = await self._terrain(geometry, href_base)
        if relief:
            result.relief, gaps = await self.relief(geometry, href_base)
            result.gaps = [*result.gaps, *gaps]
        return result

    async def relief(
        self, geometry: Geometry, href_base: str = ""
    ) -> tuple[Relief | None, list[Gap]]:
        """The detailed 3D surface alone, with the notes on what it was built from."""
        async with self.relief_lock:
            package, gaps = await self._relief(geometry)
        if package is not None:
            package.heightmap = href_base + package.heightmap
            if package.imagery is not None:
                package.imagery = href_base + package.imagery
        return package, gaps

    async def frame_index(self, bundle_id: str, bundle: FieldBundle, refresh: bool) -> FrameIndex:
        async with self.lock:
            return await self._frame_index(bundle_id, bundle, refresh)

    async def management_zones(
        self, geometry: Geometry, period: Period, soil: SoilBaseline | None, refresh: bool
    ) -> ZoneCollection:
        async with self.lock:
            return await self._management_zones(geometry, period, soil, refresh)
