"""Refresh hero series to a full daily 2001-2025 record without global downloads.

Weather and NDVI come from the point APIs the build already uses. IMERG precipitation and SMAP L4
soil moisture are read one pixel per granule through NASA's cloud OPeNDAP (bytes, not the ~30-150 MB
global files), and MOD16 ET through the ORNL point service, with POWER EVPTRNS as the manifest's
fallback. Every fetched value is cached, so an interrupted run resumes. Terrain, zones, frames,
CDL and context files are left untouched.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import tempfile
import threading
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from itza_science.contracts.canonical_series_schema import CanonicalSeries
from itza_science.contracts.field_bundle_schema import FieldBundle, Gap
from itza_science.core.field import to_shapely

from build_demo import (
    ORNL,
    POWER,
    ROOT,
    Dates,
    Hero,
    LiveSource,
    Manifest,
    Subset,
    bundle_document,
    canonical,
    dates,
    seal_publication,
)
from capture_fixtures import Archive, digest, write_json

START, END = date(2001, 1, 1), date(2025, 12, 31)
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
IMERG = "C2723754864-GES_DISC"  # GPM_3IMERGDF v07
SMAP = "C3480440870-NSIDC_CPRD"  # SPL4SMGP v008
SMAP_START = date(2015, 3, 31)
MOD16 = ORNL.replace("MOD13Q1", "MOD16A2GF")
FILL_LIMIT = 1e20
_PRINT_LOCK = threading.Lock()


class Progress:
    """Thread-safe counter that prints `label: done/total (pct)` about every 5%."""

    def __init__(self, label: str, total: int) -> None:
        self.label, self.total, self.done, self.step = label, total, 0, max(1, total // 20)
        print(f"{datetime.now(UTC):%H:%M:%S} {label}: 0/{total}", flush=True)

    def tick(self) -> None:
        with _PRINT_LOCK:
            self.done += 1
            if self.done % self.step == 0 or self.done == self.total:
                pct = 100 * self.done // max(1, self.total)
                stamp = f"{datetime.now(UTC):%H:%M:%S}"
                print(f"{stamp} {self.label}: {self.done}/{self.total} ({pct}%)", flush=True)


_VALUE = re.compile(r"^[^,\n]*\[[^\n]*\],\s*(\S+)\s*$", re.MULTILINE)


def ascii_values(text: str) -> list[float | None]:
    """Values from an OPeNDAP DAP2 `.ascii` response; fill values (<= -9990 or huge) are None."""
    out: list[float | None] = []
    for match in _VALUE.finditer(text):
        value = float(match.group(1))
        out.append(None if value <= -9990 or abs(value) >= FILL_LIMIT else value)
    return out


def imerg_index(lat: float, lon: float) -> tuple[int, int]:
    """(lon, lat) indices on the IMERG 0.1 degree grid (centres at -179.95 .. 179.95)."""
    return round((lon + 179.95) / 0.1), round((lat + 89.95) / 0.1)


def mod16_daily(
    composites: dict[date, tuple[int, int]], start: date, end: date
) -> list[float | None]:
    """Spread each 8-day composite's mean rate (mm/day) over its days; QC>=32 or fill is None.

    ET_500m is kg/m2 per composite with scale 0.1; the year's last composite is shorter.
    """
    by_day: dict[date, float] = {}
    for first, (raw, qc) in sorted(composites.items()):
        if raw >= 32700 or qc >= 32:
            continue
        last = min(first + timedelta(days=7), date(first.year, 12, 31))
        length = (last - first).days + 1
        for offset in range(length):
            by_day[first + timedelta(days=offset)] = raw * 0.1 / length
    return [by_day.get(d) for d in dates(start, end)]


def splice(
    variable: str,
    unit: str,
    parts: list[tuple[str, str, float, list[float | None]]],
    method: str,
) -> dict[str, Any]:
    """One daily series from (source, product, resolution, values) in priority order."""
    days = dates(START, END)
    values: list[float | None] = []
    segments: list[dict[str, Any]] = []
    used: list[str] = []
    for index, day in enumerate(days):
        value, source = None, ""
        for name, _product, _resolution, candidate in parts:
            if candidate[index] is not None:
                value, source = candidate[index], name
                break
        values.append(value)
        if source and (not segments or segments[-1]["source"] != source):
            segments.append({"start": day.isoformat(), "source": source})
        if source and source not in used:
            used.append(source)
    head = next((p for p in parts if p[0] in used), parts[0])
    document = canonical(variable, unit, values, START, END, head[0], head[1], head[2], method)
    if len(used) > 1:
        document["segments"] = segments
        document["provenance"]["product"] = " + ".join(p[1] for p in parts if p[0] in used)
        document["provenance"]["resolution_m"] = max(p[2] for p in parts if p[0] in used)
    return CanonicalSeries.model_validate(document).model_dump(mode="json", exclude_none=True)


class Opendap:
    """Pixel reads with an Earthdata bearer token, cached per request URL."""

    def __init__(self, cache: Path, token: str, workers: int = 16) -> None:
        self.cache, self.workers = cache, workers
        self.client = httpx.Client(
            headers={"Authorization": f"Bearer {token}"}, timeout=120, follow_redirects=True
        )

    def granules(self, collection: str, start: date, end: date) -> list[tuple[str, str]]:
        """(title, OPeNDAP URL) for every granule in the period, cached per month."""
        out: list[tuple[str, str]] = []
        month = date(start.year, start.month, 1)
        while month <= end:
            following = date(month.year + month.month // 12, month.month % 12 + 1, 1)
            path = self.cache / "cmr" / f"{collection}-{month:%Y%m}.json"
            if not path.exists():
                entries = self._cmr(collection, month, following - timedelta(days=1))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(entries))
            out.extend((t, u) for t, u in json.loads(path.read_text()))
            month = following
        return out

    def _cmr(self, collection: str, first: date, last: date) -> list[tuple[str, str]]:
        params: dict[str, str | int] = {
            "collection_concept_id": collection,
            "temporal": f"{first}T00:00:00Z,{last}T23:59:59Z",
            "page_size": 2000,
        }
        entries = httpx.get(CMR, params=params, timeout=120).raise_for_status().json()["feed"]
        result = []
        for entry in entries["entry"]:
            link = next((x["href"] for x in entry["links"] if "opendap" in x["href"]), None)
            if link:
                result.append((entry["title"], link))
        return result

    def read(self, url: str, constraint: str) -> list[float | None]:
        key = digest(f"{url}?{constraint}".encode())
        path = self.cache / "opendap" / f"{key}.json"
        if path.exists():
            cached: list[float | None] = json.loads(path.read_text())
            return cached
        # Hyrax rejects raw brackets in the constraint; percent-encode them.
        query = quote(constraint, safe="/:,=")
        for attempt in range(4):
            try:
                text = self.client.get(f"{url}.ascii?{query}").raise_for_status().text
                break
            except httpx.HTTPError:
                if attempt == 3:
                    raise
        values = ascii_values(text)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(values))
        return values

    def many(self, jobs: Iterable[tuple[str, str]], label: str) -> list[list[float | None]]:
        work = list(jobs)
        progress = Progress(label, len(work))

        def one(job: tuple[str, str]) -> list[float | None]:
            values = self.read(*job)
            progress.tick()
            return values

        with ThreadPoolExecutor(self.workers) as pool:
            return list(pool.map(one, work))


def imerg_series(dap: Opendap, lat: float, lon: float) -> list[float | None]:
    lon_i, lat_i = imerg_index(lat, lon)
    by_day: dict[date, str] = {}
    for title, url in dap.granules(IMERG, START, END):
        stamp = re.search(r"3IMERG\.(\d{8})", title)
        if stamp:
            by_day[datetime.strptime(stamp.group(1), "%Y%m%d").date()] = url
    days = [d for d in dates(START, END) if d in by_day]
    constraint = f"precipitation[0:0][{lon_i}:{lon_i}][{lat_i}:{lat_i}]"
    read = dap.many(((by_day[d], constraint) for d in days), f"precip imerg ({lat:.3f},{lon:.3f})")
    found = {d: (v[0] if v else None) for d, v in zip(days, read, strict=True)}
    return [found.get(d) for d in dates(START, END)]


def smap_series(dap: Opendap, lat: float, lon: float) -> dict[str, list[float | None]]:
    """One 3-hourly sample per day (01:30 UTC granule) for root-zone and surface moisture."""
    by_day: dict[date, str] = {}
    for title, url in dap.granules(SMAP, SMAP_START, END):
        stamp = re.search(r"_(\d{8})T013000_", title)
        if stamp:
            by_day[datetime.strptime(stamp.group(1), "%Y%m%d").date()] = url
    days = [d for d in dates(START, END) if d in by_day]
    if not days:
        return {"sm_rootzone": [None] * len(dates(START, END)), "sm_surface": []}
    col = int((lon + 180) / 360 * 3856)
    lats = dap.read(by_day[days[0]], f"cell_lat[0:1623][{col}:{col}]")
    row = min(range(len(lats)), key=lambda i: abs((lats[i] or 1e9) - lat))
    out: dict[str, list[float | None]] = {}
    for variable in ("sm_rootzone", "sm_surface"):
        constraint = f"/Geophysical_Data/{variable}[{row}:{row}][{col}:{col}]"
        label = f"{variable} smap ({lat:.3f},{lon:.3f})"
        read = dap.many(((by_day[d], constraint) for d in days), label)
        found = {d: (v[0] if v else None) for d, v in zip(days, read, strict=True)}
        out[variable] = [found.get(d) for d in dates(START, END)]
    return out


def mod16_series(archive: Archive, lat: float, lon: float) -> list[float | None]:
    point = {"latitude": lat, "longitude": lon}
    available = Dates.model_validate(json.loads(archive.get(MOD16 + "/dates", point)))
    observed = [d for d in available.dates if START <= d.calendar_date <= END]
    requests = [
        {
            **point,
            "band": band,
            "startDate": observed[i].modis_date,
            "endDate": observed[min(i + 9, len(observed) - 1)].modis_date,
            "kmAboveBelow": 0,
            "kmLeftRight": 0,
        }
        for band in ("ET_500m", "ET_QC_500m")
        for i in range(0, len(observed), 10)
    ]
    progress = Progress(f"et_actual mod16 ({lat:.3f},{lon:.3f})", len(requests))

    def one(params: dict[str, Any]) -> Subset:
        subset = Subset.model_validate_json(archive.get(MOD16 + "/subset", params))
        progress.tick()
        return subset

    composites: dict[date, list[int]] = {}
    with ThreadPoolExecutor(8) as pool:
        # ET_500m requests come before ET_QC_500m, so each date gets (value, qc).
        for subset in pool.map(one, requests):
            for record in subset.subset:
                composites.setdefault(record.calendar_date, []).append(record.data[0])
    pairs = {d: (v[0], v[1]) for d, v in composites.items() if len(v) == 2}
    return mod16_daily(pairs, START, END)


def power_extra(archive: Archive, lat: float, lon: float) -> list[float | None]:
    params: dict[str, str | int | float] = {
        "latitude": lat,
        "longitude": lon,
        "start": START.strftime("%Y%m%d"),
        "end": END.strftime("%Y%m%d"),
        "parameters": "EVPTRNS",
        "community": "AG",
        "format": "JSON",
        "time-standard": "UTC",
    }
    values = json.loads(archive.get(POWER, params))["properties"]["parameter"]["EVPTRNS"]
    out: list[float | None] = []
    for day in dates(START, END):
        value = values.get(day.strftime("%Y%m%d"))
        out.append(value if value is not None and value > -999 else None)
    return out


def refresh_series(
    hero: Hero, archive: Archive, dap: Opendap, browser: Callable[[Hero], dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[Gap]]:
    point = to_shapely(hero.geometry).centroid
    lat, lon = point.y, point.x
    base = {s["var"]: s for s in browser(hero)["series"]}
    imerg = imerg_series(dap, lat, lon)
    smap = smap_series(dap, lat, lon)
    power_precip = base.pop("precip")["values"]
    series = list(base.values())
    series.append(
        splice(
            "precip",
            "mm/day",
            [
                ("gpm_imerg_final_daily", "GPM_3IMERGDF V07", 11000, imerg),
                ("nasa_power_daily", "NASA POWER daily point", 55000, power_precip),
            ],
            "IMERG Final daily at the field centroid pixel (cloud OPeNDAP); POWER only on days "
            "without an IMERG value",
        )
    )
    for variable in ("sm_rootzone", "sm_surface"):
        values = smap.get(variable) or [None] * len(dates(START, END))
        series.append(
            splice(
                variable,
                "m3/m3",
                [("smap_l4", "SPL4SMGP v008", 9000, values)],
                "SMAP L4 01:30 UTC 3-hourly sample per day at the field centroid cell "
                "(cloud OPeNDAP); one sample, not a daily mean",
            )
        )
    series.append(
        splice(
            "et_actual",
            "mm/day",
            [
                ("ornl_modis_mod16a2gf", "MOD16A2GF v061", 500, mod16_series(archive, lat, lon)),
                (
                    "nasa_power_daily",
                    "NASA POWER daily point",
                    55000,
                    power_extra(archive, lat, lon),
                ),
            ],
            "MOD16 8-day composite mean rate spread over its days (QC < 32); POWER EVPTRNS "
            "only on days without MOD16",
        )
    )
    gaps = [
        Gap(
            var=v,
            severity="info",
            reason="SMAP L4 starts 2015-03-31; earlier days are missing, not modeled",
        )
        for v in ("sm_rootzone", "sm_surface")
    ]
    return series, gaps


def publish(directory: Path, series: list[dict[str, Any]], gaps: list[Gap]) -> None:
    bundle = FieldBundle.model_validate_json((directory / "bundle.json").read_bytes())
    keep = [s for s in bundle.series if s.var.value in ("elevation", "slope")]
    bundle.series = [*(CanonicalSeries.model_validate(s) for s in series), *keep]
    refreshed = {s["var"] for s in series}
    bundle.gaps = [g for g in bundle.gaps if g.var not in refreshed] + gaps
    bundle.generated_at = datetime.now(UTC)
    with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".history-refresh-") as tmp:
        staging = Path(tmp) / directory.name
        shutil.copytree(directory, staging)
        (staging / "ldas.json").unlink(missing_ok=True)
        write_json(staging / "bundle.json", bundle_document(bundle))
        record = json.loads((staging / "provenance.json").read_text())
        record.pop("ldas_refresh", None)
        record["history_refresh"] = {
            "code_sha256": digest(Path(__file__).read_bytes()),
            "period": {"start": str(START), "end": str(END)},
            "sources": sorted({s["provenance"]["source"] for s in series}),
        }
        seal_publication(staging, record)
        backup = Path(tmp) / "previous"
        directory.rename(backup)
        try:
            staging.rename(directory)
        except OSError:
            backup.rename(directory)
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "apps/web/public/bundles")
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument(
        "--fetch-only",
        action="store_true",
        help="Fill the cache without publishing (publishing needs the repo's Biome formatter).",
    )
    args = parser.parse_args()
    logging.getLogger("httpx").setLevel(logging.WARNING)
    token = os.environ.get("EARTHDATA_TOKEN")
    if not token:
        raise SystemExit("EARTHDATA_TOKEN is required for cloud OPeNDAP")
    archive = Archive(args.cache / "raw")
    dap = Opendap(args.cache, token, args.workers)
    live = LiveSource(None, archive, 1)
    manifest = Manifest.model_validate_json((args.output / "index.json").read_bytes())
    for hero in manifest.fields:
        if args.only and hero.id not in args.only:
            continue
        print(f"{datetime.now(UTC):%H:%M:%S} === {hero.id}: weather and NDVI", flush=True)
        series, gaps = refresh_series(hero, archive, dap, lambda h: live.browser(h, START, END))
        if args.fetch_only:
            print(f"{datetime.now(UTC):%H:%M:%S} === {hero.id}: fetched", flush=True)
            continue
        publish(args.output / hero.id, series, gaps)
        print(f"{hero.id}: refreshed {len(series)} series", flush=True)


if __name__ == "__main__":
    main()
