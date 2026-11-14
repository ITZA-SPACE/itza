"""Fine elevation and aerial imagery for one field: USGS 3DEP and USDA NAIP (United States)."""

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from io import BytesIO
from typing import Any, Protocol

import httpx
import numpy as np
from PIL import Image
from rasterio.io import MemoryFile

from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.field_bundle_schema import Gap
from itza_science.terrain.grid import FloatArray
from itza_science.terrain.models import Source
from itza_science.terrain.relief import ReliefGrid

logger = logging.getLogger(__name__)

ELEVATION_SERVICE = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
)
IMAGERY_SERVICE = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer"
TIMEOUT_S = 90
# Native cells wider than this cannot show within-field relief and are flagged as coarse.
COARSE_ABOVE_M = 10


@dataclass
class ReliefInputs:
    grid: ReliefGrid
    elevation: FloatArray
    elevation_source: Source
    imagery_jpeg: bytes | None = None
    imagery_source: Source | None = None
    gaps: list[Gap] = field(default_factory=list)


class ReliefSource(Protocol):
    async def elevation(self, grid: ReliefGrid) -> tuple[FloatArray, Source] | None: ...
    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None: ...


def _day(value: object) -> date | None:
    """Catalog dates arrive as yyyymmdd (number or text) or as epoch milliseconds."""
    try:
        number = int(str(value))
    except ValueError:
        return None
    try:
        if number > 99991231:
            return datetime.fromtimestamp(number / 1000, UTC).date()
        return date(number // 10000, number // 100 % 100, number % 100)
    except (ValueError, OverflowError, OSError):
        return None


def is_blank(jpeg: bytes) -> bool:
    """True for bytes that are not an image or an image of a single colour."""
    try:
        with Image.open(BytesIO(jpeg)) as image:
            pixels = np.asarray(image.convert("RGB"))
    except OSError:
        return True
    return bool((pixels == pixels[0, 0]).all())


class UsgsReliefSource:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def _get(self, url: str, params: dict[str, str]) -> httpx.Response | None:
        try:
            response = await self.client.get(url, params=params, timeout=TIMEOUT_S)
        except httpx.HTTPError as error:
            logger.warning("relief source request failed: %s", type(error).__name__)
            return None
        return response if response.status_code == 200 else None

    def _export(self, grid: ReliefGrid, **extra: str) -> dict[str, str]:
        return {
            "bbox": ",".join(str(v) for v in grid.bounds),
            "bboxSR": "4326",
            "imageSR": "4326",
            "size": f"{grid.width},{grid.height}",
            "f": "image",
            **extra,
        }

    async def _catalog(self, service: str, grid: ReliefGrid, fields: str) -> list[dict[str, Any]]:
        west, south, east, north = grid.bounds
        response = await self._get(
            service + "/query",
            {
                "geometry": f"{(west + east) / 2},{(south + north) / 2}",
                "geometryType": "esriGeometryPoint",
                "inSR": "4326",
                "spatialRel": "esriSpatialRelIntersects",
                "where": "Category=1",
                "outFields": fields,
                "returnGeometry": "false",
                "f": "json",
            },
        )
        if response is None:
            return []
        try:
            features = response.json().get("features", [])
        except ValueError:
            return []
        return [
            item["attributes"]
            for item in features
            if isinstance(item, dict) and isinstance(item.get("attributes"), dict)
        ]

    async def elevation(self, grid: ReliefGrid) -> tuple[FloatArray, Source] | None:
        response = await self._get(
            ELEVATION_SERVICE + "/exportImage",
            self._export(
                grid,
                format="tiff",
                pixelType="F32",
                interpolation="RSP_BilinearInterpolation",
            ),
        )
        if response is None or "tiff" not in response.headers.get("content-type", ""):
            return None
        try:
            with MemoryFile(response.content) as memory, memory.open() as dataset:
                values = np.asarray(dataset.read(1, masked=True).astype(float).filled(np.nan))
        except Exception:  # rasterio raises several unrelated types for a damaged file
            return None
        finite = values[np.isfinite(values)]
        # Outside coverage the service answers with one constant value, not an error.
        if values.shape != (grid.height, grid.width) or not finite.size:
            return None
        if float(finite.max()) == float(finite.min()):
            return None
        source = await self._elevation_source(grid)
        return (values, source) if source else None

    async def _elevation_source(self, grid: ReliefGrid) -> Source | None:
        items = [
            item
            for item in await self._catalog(
                ELEVATION_SERVICE, grid, "Name,LowPS,Category,StartDate,EndDate"
            )
            if isinstance(item.get("LowPS"), int | float) and item["LowPS"] > 0
        ]
        if not items:
            return None
        best = min(items, key=lambda item: float(item["LowPS"]))
        start, end = _day(best.get("StartDate")), _day(best.get("EndDate"))
        if start is None or end is None or start > end:
            return None
        native = float(best["LowPS"])
        return Source(
            source="USGS",
            product="3DEP",
            version=str(best.get("Name", "unknown")),
            resolution_m=native,
            period=SourcePeriod(start=start, end=end),
            method=(
                "3DEP dynamic elevation service, bilinear export on a "
                f"{grid.cell_m:.2f} m longitude/latitude grid"
            ),
            coarse=native > COARSE_ABOVE_M,
        )

    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None:
        response = await self._get(
            IMAGERY_SERVICE + "/exportImage", self._export(grid, format="jpg")
        )
        if response is None or "jpeg" not in response.headers.get("content-type", ""):
            return None
        if is_blank(response.content):
            return None
        items = await self._catalog(
            IMAGERY_SERVICE, grid, "Name,Category,acquisition_date,resolution_value"
        )
        dated = [(item, _day(item.get("acquisition_date"))) for item in items]
        latest = max(
            ((item, day) for item, day in dated if day is not None),
            key=lambda pair: pair[1],
            default=None,
        )
        if latest is None:
            return None
        item, day = latest
        native = item.get("resolution_value")
        resolution = float(native) if isinstance(native, int | float) and native > 0 else 1.0
        return response.content, Source(
            source="USDA",
            product="NAIP",
            version=str(item.get("Name", "unknown")),
            resolution_m=max(resolution, grid.cell_m),
            period=SourcePeriod(start=day, end=day),
            method="USGS NAIP Plus image service, export on a longitude/latitude grid",
        )
