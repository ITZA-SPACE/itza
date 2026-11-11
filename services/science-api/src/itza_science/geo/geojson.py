"""Conversions between the field-bundle GeoJSON contract models and shapely."""

from __future__ import annotations

from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from itza_science.contracts.field_bundle_schema import MultiPolygon, Polygon

Geometry = Polygon | MultiPolygon


def to_shapely(geometry: Geometry) -> BaseGeometry:
    return shape(geometry.model_dump())


def bbox(geometry: BaseGeometry) -> tuple[float, float, float, float]:
    west, south, east, north = geometry.bounds
    return west, south, east, north
