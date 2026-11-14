"""Per-field relief package: a fine lon/lat grid and the height image drawn by the 3D twin."""

from dataclasses import dataclass
from io import BytesIO
from math import ceil

import numpy as np
from PIL import Image
from pyproj import Geod
from rasterio.warp import transform_bounds
from scipy import ndimage
from shapely.geometry.base import BaseGeometry

from itza_science.terrain.grid import FloatArray, SpatialLimitError, project

_GEOD = Geod(ellps="WGS84")


@dataclass(frozen=True)
class ReliefGrid:
    """A raster linear in longitude and latitude, row 0 north, with near-square ground cells."""

    bounds: tuple[float, float, float, float]
    width: int
    height: int
    size_m: tuple[float, float]

    @property
    def cell_m(self) -> float:
        return self.size_m[0] / self.width

    @classmethod
    def for_field(
        cls, geometry: BaseGeometry, buffer_m: float = 150, max_side: int = 1024
    ) -> "ReliefGrid":
        if not geometry.is_valid or geometry.is_empty:
            raise SpatialLimitError("field geometry must be valid and nonempty")
        lon, lat = geometry.centroid.x, geometry.centroid.y
        if not -80 < lat < 84:
            raise SpatialLimitError("relief requires a field within UTM coverage")
        zone = max(1, min(60, int((lon + 180) / 6) + 1))
        crs = f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"
        field = project(geometry, "EPSG:4326", crs)
        if not field.is_valid or not np.isfinite(field.bounds).all():
            raise SpatialLimitError("field cannot be represented by a local metric grid")
        west, south, east, north = (
            float(v) for v in transform_bounds(crs, "EPSG:4326", *field.buffer(buffer_m).bounds)
        )
        middle = (south + north) / 2
        size_x = float(_GEOD.inv(west, middle, east, middle)[2])
        size_y = float(_GEOD.inv(west, south, west, north)[2])
        cell = max(1.0, max(size_x, size_y) / max_side)
        width = min(max_side, max(2, ceil(size_x / cell)))
        height = min(max_side, max(2, ceil(size_y / cell)))
        return cls((west, south, east, north), width, height, (size_x, size_y))


def fill_holes(elevation: FloatArray) -> tuple[FloatArray, int]:
    """Replaces non-finite cells with the nearest valid cell; returns the count replaced."""
    holes = ~np.isfinite(elevation)
    count = int(holes.sum())
    if count == elevation.size:
        raise ValueError("elevation has no valid cell")
    if count == 0:
        return elevation, 0
    nearest = ndimage.distance_transform_edt(holes, return_distances=False, return_indices=True)
    return np.asarray(elevation[tuple(nearest)], dtype=np.float64), count


def encode_heights(elevation: FloatArray) -> tuple[bytes, float, float, int]:
    """PNG with a 16-bit height split over red (high byte) and green; min, max, holes filled."""
    filled, count = fill_holes(np.asarray(elevation, dtype=np.float64))
    low, high = float(filled.min()), float(filled.max())
    span = high - low
    scaled = (
        np.rint((filled - low) / span * 65535).astype(np.uint16)
        if span > 0
        else np.zeros(filled.shape, dtype=np.uint16)
    )
    rgb = np.zeros((*filled.shape, 3), dtype=np.uint8)
    rgb[..., 0] = scaled >> 8
    rgb[..., 1] = scaled & 255
    out = BytesIO()
    Image.fromarray(rgb, "RGB").save(out, "PNG", optimize=True)
    return out.getvalue(), low, high, count
