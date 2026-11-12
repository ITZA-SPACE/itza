"""GEDI L2A RH98/L2B cover, filtered by quality and true 2 km metric distance."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import h5py
import numpy as np
from pyproj import Transformer
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry

from itza_science.context.models import Footprint, FootprintProperties, PointGeometry
from itza_science.terrain.grid import project

MAX_FOOTPRINTS = 2000


def read_gedi(path: Path, field: BaseGeometry, product: str) -> tuple[list[Footprint], bool]:
    lon, lat = field.centroid.x, field.centroid.y
    crs = f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"
    buffered = project(field, "EPSG:4326", crs).buffer(2000)
    metric_field = project(field, "EPSG:4326", crs)
    west, south, east, north = project(buffered, crs, "EPSG:4326").bounds
    transformer = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    output = []
    with h5py.File(path, "r") as file:
        for name in sorted(file):
            if not name.startswith("BEAM"):
                continue
            beam = file[name]
            is_l2a = product == "GEDI02_A"
            geo = beam if is_l2a else beam["geolocation"]
            latitudes = np.asarray(geo["lat_lowestmode"][:], dtype=float)
            longitudes = np.asarray(geo["lon_lowestmode"][:], dtype=float)
            quality = np.asarray(beam["quality_flag" if is_l2a else "l2b_quality_flag"][:])
            degraded = np.asarray(geo["degrade_flag"][:])
            sensitivity = np.asarray(beam["sensitivity"][:], dtype=float)
            valid = (quality == 1) & (degraded == 0) & (sensitivity >= 0.9) & (sensitivity <= 1)
            valid &= np.isfinite(latitudes) & np.isfinite(longitudes)
            valid &= (np.abs(latitudes) <= 90) & (np.abs(longitudes) <= 180)
            valid &= (latitudes >= south) & (latitudes <= north)
            valid &= (longitudes >= west) & (longitudes <= east)
            for index in np.flatnonzero(valid):
                point = Point(float(longitudes[index]), float(latitudes[index]))
                native = Point(*transformer.transform(point.x, point.y))
                if not buffered.covers(native):
                    continue
                value = float(beam["rh"][index, 98] if is_l2a else beam["cover"][index])
                if (
                    not np.isfinite(value)
                    or (not is_l2a and not 0 <= value <= 1)
                    or (is_l2a and not 0 <= value <= 150)
                ):
                    continue
                delta = float(geo["delta_time"][index])
                if not np.isfinite(delta) or delta < 0:
                    continue
                day = (datetime(2018, 1, 1, tzinfo=UTC) + timedelta(seconds=delta)).date()
                output.append(
                    Footprint(
                        geometry=PointGeometry(coordinates=(point.x, point.y)),
                        properties=FootprintProperties(
                            shot_number=str(int(beam["shot_number"][index])),
                            date=day,
                            height_m=value if is_l2a else None,
                            cover_fraction=None if is_l2a else value,
                            on_field=metric_field.buffer(12.5).covers(native),
                            products=[product],
                        ),
                    )
                )
                if len(output) == MAX_FOOTPRINTS:
                    return output, True
    return output, False
