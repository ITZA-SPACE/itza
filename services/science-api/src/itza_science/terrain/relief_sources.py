"""Elevation and imagery for one field: USGS 3DEP and USDA NAIP, then global fallbacks."""

import asyncio
import logging
import math
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from io import BytesIO
from typing import Any, Protocol

import httpx
import numpy as np
from affine import Affine
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject
from scipy import ndimage
from shapely.geometry.base import BaseGeometry

from itza_science.contracts.common_schema import Period as SourcePeriod
from itza_science.contracts.field_bundle_schema import Gap
from itza_science.terrain.grid import FloatArray, Grid
from itza_science.terrain.models import Source
from itza_science.terrain.relief import ReliefGrid
from itza_science.terrain.sources import SpatialSource

logger = logging.getLogger(__name__)

ELEVATION_SERVICE = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
)
IMAGERY_SERVICE = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer"
TIMEOUT_S = 90
ATTEMPTS = 2
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
        # The public image services drop a share of requests; one more try clears most of them.
        for attempt in range(ATTEMPTS):
            try:
                response = await self.client.get(url, params=params, timeout=TIMEOUT_S)
            except httpx.TransportError as error:
                logger.warning(
                    "relief source request failed (attempt %d): %s",
                    attempt + 1,
                    type(error).__name__,
                )
                continue
            return response if response.status_code == 200 else None
        return None

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
        # The export takes 10 to 30 s: ask the catalog for its provenance at the same time.
        response, source = await asyncio.gather(
            self._get(
                ELEVATION_SERVICE + "/exportImage",
                self._export(
                    grid,
                    format="tiff",
                    pixelType="F32",
                    interpolation="RSP_BilinearInterpolation",
                ),
            ),
            self._elevation_source(grid),
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
        response, items = await asyncio.gather(
            self._get(IMAGERY_SERVICE + "/exportImage", self._export(grid, format="jpg")),
            self._catalog(IMAGERY_SERVICE, grid, "Name,Category,acquisition_date,resolution_value"),
        )
        if response is None or "jpeg" not in response.headers.get("content-type", ""):
            return None
        if is_blank(response.content):
            return None
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


EOX_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"
EOX_ZOOM = 15
EOX_MAX_TILES = 16
_MERCATOR_EDGE = 20037508.342789244


def _tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    count = 2**zoom
    x = int((lon + 180) / 360 * count)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * count)
    return min(count - 1, max(0, x)), min(count - 1, max(0, y))


class _TileImagery:
    """A mosaic of 256 px web-mercator tiles warped onto the relief grid."""

    tiles = EOX_TILES
    zoom = EOX_ZOOM
    max_tiles = EOX_MAX_TILES
    label = "EOX"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None:
        west, south, east, north = grid.bounds
        left, top = _tile(west, north, self.zoom)
        right, bottom = _tile(east, south, self.zoom)
        columns, rows = right - left + 1, bottom - top + 1
        if columns * rows > self.max_tiles:
            return None
        mosaic = np.zeros((3, rows * 256, columns * 256), dtype=np.uint8)
        for row in range(rows):
            for column in range(columns):
                url = self.tiles.format(z=self.zoom, y=top + row, x=left + column)
                try:
                    response = await self.client.get(url, timeout=TIMEOUT_S)
                    response.raise_for_status()
                    with Image.open(BytesIO(response.content)) as image:
                        tile = np.asarray(image.convert("RGB").resize((256, 256)))
                except (httpx.HTTPError, OSError) as error:
                    logger.warning("%s tile failed: %s", self.label, type(error).__name__)
                    return None
                mosaic[:, row * 256 : (row + 1) * 256, column * 256 : (column + 1) * 256] = (
                    tile.transpose(2, 0, 1)
                )
        size = 2 * _MERCATOR_EDGE / 2**self.zoom
        pixel = size / 256
        source_transform = Affine(
            pixel, 0, -_MERCATOR_EDGE + left * size, 0, -pixel, _MERCATOR_EDGE - top * size
        )
        target = np.zeros((3, grid.height, grid.width), dtype=np.uint8)
        reproject(
            mosaic,
            target,
            src_transform=source_transform,
            src_crs="EPSG:3857",
            dst_transform=from_bounds(west, south, east, north, grid.width, grid.height),
            dst_crs="EPSG:4326",
            resampling=Resampling.bilinear,
        )
        out = BytesIO()
        Image.fromarray(target.transpose(1, 2, 0), "RGB").save(out, "JPEG", quality=85)
        jpeg = out.getvalue()
        if is_blank(jpeg):
            return None
        return jpeg, self.source()

    def source(self) -> Source:
        raise NotImplementedError


class EoxImagerySource(_TileImagery):
    """Sentinel-2 cloudless 2016 mosaic (CC BY 4.0): the global, 10 m aerial picture."""

    def source(self) -> Source:
        return Source(
            source="EOX",
            product="s2cloudless",
            version="2016",
            resolution_m=10,
            period=SourcePeriod(start=date(2016, 1, 1), end=date(2017, 12, 31)),
            method=(
                "EOxCloudless 2016 mosaic by EOX IT Services GmbH (contains modified "
                "Copernicus Sentinel data 2016 & 2017), CC BY 4.0; WMTS tiles warped to "
                "a longitude/latitude grid"
            ),
            coarse=True,
        )


ESRI_TILES = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
)


class EsriImagerySource(_TileImagery):
    """Esri World Imagery at zoom 17 (about 1 m): sharper than the 10 m mosaic."""

    tiles = ESRI_TILES
    zoom = 17
    max_tiles = 49
    label = "Esri"

    def source(self) -> Source:
        return Source(
            source="Esri",
            product="World Imagery",
            version="zoom 17",
            resolution_m=1,
            period=SourcePeriod(start=date(2020, 1, 1), end=date(2026, 1, 1)),
            method=(
                "Esri World Imagery (Esri, Maxar, Earthstar Geographics and the GIS User "
                "Community); tiles warped to a longitude/latitude grid"
            ),
        )


TERRARIUM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TERRARIUM_ZOOM = 13
TERRARIUM_MAX_TILES = 16


class TerrariumElevationSource:
    """Open 30 m class elevation (AWS Terrain Tiles), used where nothing finer is reachable."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def elevation(self, grid: ReliefGrid) -> tuple[FloatArray, Source] | None:
        west, south, east, north = grid.bounds
        left, top = _tile(west, north, TERRARIUM_ZOOM)
        right, bottom = _tile(east, south, TERRARIUM_ZOOM)
        columns, rows = right - left + 1, bottom - top + 1
        if columns * rows > TERRARIUM_MAX_TILES:
            return None
        mosaic = np.full((rows * 256, columns * 256), np.nan)
        for row in range(rows):
            for column in range(columns):
                url = TERRARIUM_TILES.format(z=TERRARIUM_ZOOM, x=left + column, y=top + row)
                try:
                    response = await self.client.get(url, timeout=TIMEOUT_S)
                    response.raise_for_status()
                    with Image.open(BytesIO(response.content)) as image:
                        rgb = np.asarray(image.convert("RGB").resize((256, 256)), dtype=np.float64)
                except (httpx.HTTPError, OSError) as error:
                    logger.warning("terrain tile failed: %s", type(error).__name__)
                    return None
                # Terrarium encoding: metres = red * 256 + green + blue / 256 - 32768.
                mosaic[row * 256 : (row + 1) * 256, column * 256 : (column + 1) * 256] = (
                    rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
                )
        size = 2 * _MERCATOR_EDGE / 2**TERRARIUM_ZOOM
        pixel = size / 256
        target = np.full((grid.height, grid.width), np.nan)
        reproject(
            mosaic,
            target,
            src_transform=Affine(
                pixel, 0, -_MERCATOR_EDGE + left * size, 0, -pixel, _MERCATOR_EDGE - top * size
            ),
            src_crs="EPSG:3857",
            src_nodata=np.nan,
            dst_transform=from_bounds(west, south, east, north, grid.width, grid.height),
            dst_crs="EPSG:4326",
            dst_nodata=np.nan,
            resampling=Resampling.cubic,
        )
        finite = target[np.isfinite(target)]
        if finite.size != target.size or float(finite.max()) == float(finite.min()):
            return None
        # The tiles hold whole metres: blur over about one source cell so the steps do not
        # show up as terraces on a one-metre grid.
        target = np.asarray(ndimage.gaussian_filter(target, sigma=20 / grid.cell_m, mode="nearest"))
        return target, Source(
            source="AWS Terrain Tiles",
            product="Terrarium",
            version=f"zoom {TERRARIUM_ZOOM}",
            resolution_m=30,
            period=SourcePeriod(start=date(2000, 2, 11), end=date(2000, 2, 22)),
            method=(
                "Open terrain tiles (Mapzen/Tilezen compilation; SRTM 1 arc-second outside "
                "the regions with finer national models), smoothed onto the relief grid"
            ),
            coarse=True,
        )


class ImagerySource(Protocol):
    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None: ...


class FirstImagery:
    """The first of several imagery sources that has a picture for the grid."""

    def __init__(self, *sources: ImagerySource) -> None:
        self.sources = sources

    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None:
        for source in self.sources:
            picture = await source.imagery(grid)
            if picture is not None:
                return picture
        return None


class ElevationSource(Protocol):
    async def elevation(self, grid: ReliefGrid) -> tuple[FloatArray, Source] | None: ...


def _note(variable: str, reason: str) -> Gap:
    return Gap.model_validate({"var": variable, "reason": reason, "severity": "info"})


async def _coarse_elevation(
    geometry: BaseGeometry, grid: ReliefGrid, dem: SpatialSource
) -> tuple[FloatArray, Source] | None:
    analysis = Grid.for_field(geometry)
    inputs = await dem.dem(analysis)
    if inputs.elevation is None or inputs.dem_source is None:
        logger.warning("no 30 m elevation: %s", "; ".join(g.reason for g in inputs.gaps) or "empty")
        return None
    target = np.full((grid.height, grid.width), np.nan)
    reproject(
        inputs.elevation,
        target,
        src_transform=analysis.affine,
        src_crs=analysis.crs,
        src_nodata=np.nan,
        dst_transform=from_bounds(*grid.bounds, grid.width, grid.height),
        dst_crs="EPSG:4326",
        dst_nodata=np.nan,
        resampling=Resampling.cubic,
    )
    if not np.isfinite(target).any():
        return None
    return target, inputs.dem_source.model_copy(update={"coarse": True})


async def build_relief(
    geometry: BaseGeometry,
    primary: ReliefSource,
    coarse_dem: SpatialSource,
    coarse_imagery: ImagerySource,
    open_dem: ElevationSource | None = None,
) -> ReliefInputs | None:
    """Fine sources first; the 30 m DEM and the 2016 mosaic where they have no coverage.

    `open_dem` is tried last, when the 30 m DEM itself cannot be read (no Earthdata login).
    """
    grid = ReliefGrid.for_field(geometry)
    gaps: list[Gap] = []
    # Height and picture come from separate services: fetch them together.
    elevation, picture = await asyncio.gather(primary.elevation(grid), primary.imagery(grid))
    if elevation is None:
        elevation = await _coarse_elevation(geometry, grid, coarse_dem)
        if elevation is None and open_dem is not None:
            elevation = await open_dem.elevation(grid)
        if elevation is None:
            return None
        gaps.append(
            _note(
                "elevation",
                "No fine elevation here; the 30 m model is smoothed onto the relief grid "
                "and shows only broad shape",
            )
        )
    if picture is None:
        picture = await coarse_imagery.imagery(grid)
        if picture is not None:
            gaps.append(
                _note("imagery", "No aerial survey photo here; a satellite picture is shown")
            )
    if picture is None:
        gaps.append(_note("imagery", "No picture of the surface is available for this field"))
    return ReliefInputs(
        grid=grid,
        elevation=elevation[0],
        elevation_source=elevation[1],
        imagery_jpeg=picture[0] if picture else None,
        imagery_source=picture[1] if picture else None,
        gaps=gaps,
    )
