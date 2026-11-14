"""Bounded, aligned 30 m projected grids; no finer native resolution is implied."""

from dataclasses import dataclass
from math import ceil, floor

import numpy as np
from affine import Affine
from numpy.typing import NDArray
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.warp import transform_bounds
from shapely import transform
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

FloatArray = NDArray[np.float64]


class SpatialLimitError(ValueError):
    """The requested raster would exceed the bounded per-field working set."""


def project(geometry: BaseGeometry, source: str, target: str) -> BaseGeometry:
    transformer = Transformer.from_crs(source, target, always_xy=True)

    def coordinates(array: FloatArray) -> FloatArray:
        return np.column_stack(transformer.transform(array[:, 0], array[:, 1]))

    return transform(geometry, coordinates)


@dataclass(frozen=True)
class Grid:
    crs: str
    affine: Affine
    height: int
    width: int
    field: BaseGeometry

    @classmethod
    def for_field(cls, geometry: BaseGeometry, buffer_m: float = 300) -> "Grid":
        if not geometry.is_valid or geometry.is_empty:
            raise SpatialLimitError("field geometry must be valid and nonempty")
        lon, lat = geometry.centroid.x, geometry.centroid.y
        if not -80 < lat < 84:
            raise SpatialLimitError("30 m analysis requires a field within UTM coverage")
        zone = max(1, min(60, int((lon + 180) / 6) + 1))
        crs = f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"
        field = project(geometry, "EPSG:4326", crs)
        if not field.is_valid or not np.isfinite(field.bounds).all():
            raise SpatialLimitError("field cannot be represented by a local metric grid")
        west, south, east, north = field.buffer(buffer_m).bounds
        west, north = floor(west / 30) * 30, ceil(north / 30) * 30
        width, height = ceil((east - west) / 30), ceil((north - south) / 30)
        if width * height > 500000:
            raise SpatialLimitError("field extent exceeds the 500000-cell spatial analysis limit")
        return cls(crs, Affine(30, 0, west, 0, -30, north), height, width, field)

    @property
    def shape(self) -> tuple[int, int]:
        return self.height, self.width

    @property
    def mask(self) -> NDArray[np.bool_]:
        return np.asarray(
            geometry_mask(
                [mapping(self.field)], out_shape=self.shape, transform=self.affine, invert=True
            ),
            dtype=np.bool_,
        )

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return tuple(
            float(v)
            for v in transform_bounds(
                self.crs,
                "EPSG:4326",
                self.affine.c,
                self.affine.f - self.height * 30,
                self.affine.c + self.width * 30,
                self.affine.f,
            )
        )  # type: ignore[return-value]  # rasterio returns exactly four bounds

    def field_window(self) -> tuple[slice, slice]:
        rows, cols = np.where(self.mask)
        if not rows.size:
            raise SpatialLimitError("field does not contain a 30 m pixel center")
        return slice(int(rows.min()), int(rows.max()) + 1), slice(
            int(cols.min()), int(cols.max()) + 1
        )
