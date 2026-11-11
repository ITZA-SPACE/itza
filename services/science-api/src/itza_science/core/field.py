"""Field id, area and centroid, matching TECHNICAL_ARCHITECTURE.md §5.4's caching key."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pyproj import Geod
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from itza_science.contracts.field_bundle_schema import MultiPolygon, Polygon

Geometry = Polygon | MultiPolygon
_ROUND_DIGITS = 5
_GEOD = Geod(ellps="WGS84")


def _round_rounded(data: Any) -> Any:
    if isinstance(data, list):
        return [_round_rounded(item) for item in data]
    if isinstance(data, float):
        return round(data, _ROUND_DIGITS)
    return data


def rounded_geometry(geometry: Geometry) -> dict[str, Any]:
    """The geometry's own JSON shape with every coordinate rounded to 1e-5 degrees."""
    data = geometry.model_dump()
    data["coordinates"] = _round_rounded(data["coordinates"])
    return data


def field_id(geometry: Geometry) -> str:
    """sha256 of the geometry rounded to 1e-5 degrees."""
    canonical = json.dumps(rounded_geometry(geometry), sort_keys=True, separators=(",", ":"))
    return f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}"


def to_shapely(geometry: Geometry) -> BaseGeometry:
    return shape(geometry.model_dump())


def area_ha(shapely_geometry: BaseGeometry) -> float:
    area_m2, _perimeter_m = _GEOD.geometry_area_perimeter(shapely_geometry)
    return abs(area_m2) / 10_000.0


def centroid(shapely_geometry: BaseGeometry) -> tuple[float, float]:
    point = shapely_geometry.centroid
    return point.x, point.y
