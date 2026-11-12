"""Capture public ORNL MODIS and POWER responses. No network access in tests."""

import argparse
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from pyproj import CRS, Transformer

from data import Day, PixelSeason, build_features

ORNL = "https://modis.ornl.gov/rst/api/v1"
POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
SITES = [
    ("dz-high-plains", 35.72, 4.93),
    ("dz-high-plains", 36.12, 5.73),
    ("dz-high-plains", 35.52, 6.33),
    ("us-central-great-plains", 40.15, -103.15),
    ("us-central-great-plains", 39.35, -102.35),
    ("us-central-great-plains", 40.95, -101.55),
]


class AvailableDate(BaseModel):
    modis_date: str = Field(pattern=r"^A\d{7}$")
    calendar_date: date


class DatesResponse(BaseModel):
    dates: list[AvailableDate]


class Composite(BaseModel):
    calendar_date: date
    band: str
    data: list[int]


class SubsetResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    xllcorner: float
    yllcorner: float
    cellsize: float = Field(gt=0)
    nrows: int = Field(gt=0, le=100)
    ncols: int = Field(gt=0, le=100)
    subset: list[Composite]


class PowerProperties(BaseModel):
    parameter: dict[str, dict[str, float]]


class PowerResponse(BaseModel):
    properties: PowerProperties


class Archive:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.pool = ThreadPoolExecutor(max_workers=12)
        directory.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, **params: str | float) -> dict[str, Any]:
        key = hashlib.sha256(str(httpx.URL(url, params=params)).encode()).hexdigest()
        path = self.directory / f"{key}.json"
        if path.exists():
            return dict(json.loads(path.read_text()))
        for attempt in range(5):
            try:
                response = httpx.get(url, params=params, timeout=120, follow_redirects=True)
                response.raise_for_status()
                value = dict(response.json())
                path.write_text(json.dumps(value))
                return value
            except (httpx.HTTPError, ValueError):
                if attempt == 4:
                    raise
                time.sleep(2**attempt)
        raise RuntimeError("unreachable")

    def subset(self, product: str, lat: float, lon: float, band: str) -> list[dict[str, Any]]:
        params = {"latitude": lat, "longitude": lon}
        dates = DatesResponse.model_validate(
            self.get(f"{ORNL}/{product}/dates", **params)
        ).model_dump(mode="json")["dates"]
        dates = [d["modis_date"] for d in dates if "2000" <= d["calendar_date"][:4] <= "2025"]
        chunks = [
            year_dates[start : start + 10]
            for year in range(2000, 2026)
            for year_dates in [
                [
                    d
                    for d in dates
                    if d[1:5] == str(year) and (product != "MOD13Q1" or int(d[5:]) <= 177)
                ]
            ]
            for start in range(0, len(year_dates), 10)
        ]
        if product != "MOD13Q1":
            chunks = [dates[start : start + 10] for start in range(0, len(dates), 10)]

        def fetch(chunk: list[str]) -> dict[str, Any]:
            return self.get(
                f"{ORNL}/{product}/subset",
                **params,
                band=band,
                startDate=chunk[0],
                endDate=chunk[-1],
                kmAboveBelow=1,
                kmLeftRight=1,
            )

        result = list(self.pool.map(fetch, chunks))
        return [SubsetResponse.model_validate(part).model_dump(mode="json") for part in result]


def hargreaves(day: date, lat: float, low: float, high: float) -> float:
    """FAO-56 eq. 52 Hargreaves ET0; extraterrestrial radiation eqs. 21–25."""
    phi = np.deg2rad(lat)
    angle = 2 * np.pi * day.timetuple().tm_yday / 365
    declination = 0.409 * np.sin(angle - 1.39)
    sunset = np.arccos(np.clip(-np.tan(phi) * np.tan(declination), -1, 1))
    ra = (
        24
        * 60
        / np.pi
        * 0.0820
        * (1 + 0.033 * np.cos(angle))
        * (
            sunset * np.sin(phi) * np.sin(declination)
            + np.cos(phi) * np.cos(declination) * np.sin(sunset)
        )
    )
    return max(0.0, float(0.0023 * ((low + high) / 2 + 17.8) * np.sqrt(high - low) * 0.408 * ra))


def center(record: dict[str, Any], index: int) -> tuple[float, float]:
    cols, rows, size = record["ncols"], record["nrows"], float(record["cellsize"])
    return (
        float(record["xllcorner"]) + (index % cols + 0.5) * size,
        float(record["yllcorner"]) + (rows - index // cols - 0.5) * size,
    )


def capture_site(archive: Archive, site: tuple[str, float, float]) -> list[PixelSeason]:
    region, lat, lon = site
    block = f"{region}:{lat}:{lon}"
    print(f"Capturing {block}", flush=True)
    vegetation = archive.subset("MOD13Q1", lat, lon, "250m_16_days_NDVI")
    quality = archive.subset("MOD13Q1", lat, lon, "250m_16_days_pixel_reliability")
    land = archive.subset("MCD12Q1", lat, lon, "LC_Type1")
    qa = {r["calendar_date"]: r["data"] for part in quality for r in part["subset"]}
    cover = {int(r["calendar_date"][:4]): r["data"] for part in land for r in part["subset"]}
    grid, land_grid = vegetation[0], land[0]
    peaks: dict[tuple[int, int], list[float]] = {}
    for part in vegetation:
        for record in part["subset"]:
            day = date.fromisoformat(record["calendar_date"])
            if day.year < 2001 or day.month > 6:
                continue
            flags = qa[record["calendar_date"]]
            for pixel, value in enumerate(record["data"]):
                if flags[pixel] == 0 and -2000 <= value <= 10000:
                    peaks.setdefault((day.year, pixel), []).append(value * 0.0001)
    weather = archive.get(
        POWER,
        latitude=lat,
        longitude=lon,
        start="20010101",
        end="20251231",
        parameters="T2M_MIN,T2M_MAX,PRECTOTCORR",
        community="AG",
        format="JSON",
    )
    parameters = PowerResponse.model_validate(weather).properties.parameter
    stage_names = ("initial", "development", "mid", "late")
    features = {}
    for year in range(2001, 2026):
        days: list[Day] = []
        for key, rain in sorted(parameters["PRECTOTCORR"].items()):
            if not key.startswith(str(year)) or key[4:6] > "06":
                continue
            day = date(int(key[:4]), int(key[4:6]), int(key[6:8]))
            low, high = parameters["T2M_MIN"][key], parameters["T2M_MAX"][key]
            if min(low, high, rain) <= -999:
                days = []
                break
            # Fixed retrospective winter-cereal windows, not inferred crop phenology.
            stage = stage_names[min(3, (day.timetuple().tm_yday - 1) // 46)]
            days.append(
                Day(
                    date=day,
                    stage=stage,
                    rain_mm=rain,
                    et0_mm=hargreaves(day, lat, low, high),
                    tmin_c=low,
                    tmax_c=high,
                )
            )
        if len(days) == (date(year, 7, 1) - date(year, 1, 1)).days:
            features[year] = build_features(days)
    # MODIS grids share the sinusoidal CRS; resample the 500 m categorical mask by nearest center.
    crs = CRS.from_proj4("+proj=sinu +R=6371007.181 +nadgrids=@null +wktext")
    to_lonlat = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    rows = []
    for (year, pixel), values in sorted(peaks.items()):
        if len(values) < 6 or year not in features:
            continue
        x, y = center(grid, pixel)
        col = int((x - float(land_grid["xllcorner"])) // float(land_grid["cellsize"]))
        row = (
            land_grid["nrows"]
            - 1
            - int((y - float(land_grid["yllcorner"])) // float(land_grid["cellsize"]))
        )
        # Do not invent a 2025 land-cover observation when that year's product is not published.
        if year not in cover or not (
            0 <= col < land_grid["ncols"] and 0 <= row < land_grid["nrows"]
        ):
            continue
        if cover[year][row * land_grid["ncols"] + col] != 12:
            continue
        previous = peaks.get((year - 1, pixel), [])
        state = features[year].model_copy(
            update={"previous_peak_ndvi": max(previous) if len(previous) >= 6 else None}
        )
        pixel_lon, pixel_lat = to_lonlat.transform(x, y)
        rows.append(
            PixelSeason(
                region=region,
                block=block,
                pixel=f"{pixel_lat:.6f},{pixel_lon:.6f}",
                year=year,
                cropland=True,
                peak_ndvi=max(values),
                features=state,
            )
        )
    print(f"Captured {len(rows)} cropland pixel-seasons in {block}", flush=True)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    archive = Archive(args.cache)
    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = [
            row
            for group in pool.map(lambda site: capture_site(archive, site), SITES)
            for row in group
        ]
    args.output.write_text("\n".join(row.model_dump_json() for row in rows) + "\n")


if __name__ == "__main__":
    main()
