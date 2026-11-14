"""Capture official IMERG Final monthly rates using small authenticated OPeNDAP subsets.

The full monthly product avoids extrapolating the dataset store's sampled daily rain.
Source responses, query URLs, coordinates and hashes are retained without credentials.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import earthaccess
import requests
from build import HERE, Capture, Observation
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

PRODUCT, VERSION = "GPM_3IMERGM", "07"
DOI = "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07"
START, END = "2008-01-01", "2025-12-31"
DAP = "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/hyrax/GPM_L3/GPM_3IMERGM.07"


def monthly_depth(rate: float, period: str, unit: str = "mm/hr") -> float | None:
    """Mean rate times the exact number of hours in its calendar month."""
    if unit != "mm/hr":
        raise ValueError("expected IMERG precipitation in mm/hr")
    day = date.fromisoformat(period + "-01")
    if not math.isfinite(rate) or rate < 0:
        return None
    return rate * 24 * calendar.monthrange(day.year, day.month)[1]


def cell(longitude: float, latitude: float) -> tuple[int, int]:
    if not -180 <= longitude < 180 or not -90 <= latitude < 90:
        raise ValueError("invalid centroid")
    return math.floor((longitude + 180) * 10), math.floor((latitude + 90) * 10)


def parse_subset(payload: str, filename: str, x: int, y: int) -> tuple[float | None, list[float]]:
    """Reject full grids, wrong files and wrong coordinates instead of silently sampling them."""
    lines = [line.strip() for line in payload.splitlines() if line.strip()]
    if not lines or lines[0] != f"Dataset: {filename}":
        raise ValueError("unexpected IMERG dataset in subset")
    values = {}
    for line in lines[1:]:
        match = re.fullmatch(r"(precipitation|lon|lat)(?:\[0\])*,\s*([^,]+)", line)
        if not match or match[1] in values:
            raise ValueError("expected exactly one precipitation, lon and lat value")
        values[match[1]] = float(match[2])
    if set(values) != {"precipitation", "lon", "lat"}:
        raise ValueError("incomplete IMERG subset")
    center = [values["lon"], values["lat"]]
    if not (
        math.isclose(center[0], x / 10 - 179.95, abs_tol=0.0001)
        and math.isclose(center[1], y / 10 - 89.95, abs_tol=0.0001)
    ):
        raise ValueError("IMERG subset coordinates do not match the requested cell")
    rate = values["precipitation"]
    return (rate if math.isfinite(rate) and rate >= 0 else None), center


def get_text(url: str) -> str:
    # A fresh Earthdata-authenticated session per request avoids shared mutable cookies in threads.
    session = earthaccess.get_requests_https_session()
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=4,
                backoff_factor=1,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["GET"],
            )
        ),
    )
    with session, session.get(url, timeout=60, stream=True) as response:
        response.raise_for_status()
        data = bytearray()
        for chunk in response.iter_content(8192):
            data.extend(chunk)
            if len(data) > 65536:
                raise ValueError("IMERG subset unexpectedly exceeds 64 KiB")
        return data.decode("utf-8")


def fetch_month(item: tuple[str, str], fields: list[dict[str, Any]]) -> dict[str, Any]:
    period, original_url = item
    filename = Path(urlparse(original_url).path).name
    if not re.fullmatch(
        r"3B-MO\.MS\.MRG\.3IMERG\.\d{8}-S000000-E235959\.\d{2}\.V07B\.HDF5", filename
    ):
        raise ValueError("unexpected IMERG monthly filename")
    if f".{period.replace('-', '')}01-" not in filename:
        raise ValueError("IMERG filename does not match its reported month")
    base = f"{DAP}/{period[:4]}/{filename}"
    samples, subsets = [], []
    cells = {cell(*f["centroid"]) for f in fields}
    for x, y in sorted(cells):
        query = f"precipitation[0:1:0][{x}:1:{x}][{y}:1:{y}],lon[{x}:1:{x}],lat[{y}:1:{y}]"
        url = base + ".ascii?" + query
        response = get_text(url)
        rate, center = parse_subset(response, filename, x, y)
        subsets.append(
            {
                "url": url,
                "response": response,
                "sha256": hashlib.sha256(response.encode()).hexdigest(),
            }
        )
        for field in fields:
            if cell(*field["centroid"]) == (x, y):
                samples.append(
                    {
                        "field": field["id"],
                        "centroid": field["centroid"],
                        "cell_center": center,
                        "index_lon_lat": [x, y],
                        "period": period,
                        "rate_mm_per_hour": rate,
                        "depth_mm": monthly_depth(rate, period) if rate is not None else None,
                    }
                )
    return {"period": period, "url": original_url, "subsets": subsets, "samples": samples}


def write_captures(raw: dict[str, Any]) -> None:
    fields = json.loads((HERE / "data/replay.json").read_text())["fields"]
    for field in fields:
        observed = {
            row["period"]: sample["depth_mm"]
            for row in raw["granules"]
            for sample in row["samples"]
            if sample["field"] == field["id"]
        }
        observations = [
            Observation(period=f"{year}-{month:02}", value=observed.get(f"{year}-{month:02}"))
            for year in range(2008, 2026)
            for month in range(1, 13)
        ]
        capture = Capture(
            source="imerg_monthly",
            field=field["id"],
            retrieved=raw["retrieved"],
            url=DOI,
            resolution=(
                "0.1 degree (about 11 km) grid cell at the sampling-area "
                "centroid; official monthly mean rate × hours in month"
            ),
            unit="mm/month",
            status="ready",
            observations=observations,
        )
        (HERE / f"data/{field['id']}-imerg_monthly.json").write_text(
            capture.model_dump_json(indent=2) + "\n"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="service env file with Earthdata credentials")
    args = parser.parse_args()
    if args.env_file:
        load_dotenv(args.env_file, override=False)
    if not earthaccess.login(strategy="environment", persist=False).authenticated:
        raise SystemExit("Earthdata authentication required")
    fields = json.loads((HERE / "data/replay.json").read_text())["fields"]
    raw_path = HERE / "data/raw/imerg-monthly.json"
    raw: dict[str, Any] = (
        json.loads(raw_path.read_text())
        if raw_path.exists()
        else {
            "product": PRODUCT,
            "version": VERSION,
            "doi": DOI,
            "period": [START, END],
            "retrieved": date.today().isoformat(),
            "method": "containing centroid cell; official monthly mm/hr × calendar hours",
            "granules": [],
        }
    )
    results = earthaccess.search_data(
        short_name=PRODUCT, version=VERSION, temporal=(START, END), count=300
    )
    done = {row["period"] for row in raw["granules"] if "subsets" in row}
    available = set()
    wanted = []
    for granule in results:
        period = str(granule["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"])[:7]
        available.add(period)
        if period not in done:
            url = next(u for u in granule.data_links(access="external") if u.endswith(".HDF5"))
            wanted.append((period, url))
    wanted.sort()
    if "metadata" not in raw:
        metadata_url = DAP + "/2020/3B-MO.MS.MRG.3IMERG.20200101-S000000-E235959.01.V07B.HDF5.das"
        response = get_text(metadata_url)
        if not re.search(r'precipitation\s*\{[^}]*String units "mm/hr";', response):
            raise ValueError("IMERG metadata does not confirm precipitation in mm/hr")
        raw["metadata"] = {
            "url": metadata_url,
            "response": response,
            "sha256": hashlib.sha256(response.encode()).hexdigest(),
        }
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_month, item, fields): item[0] for item in wanted}
        for future in as_completed(futures):
            try:
                row = future.result()
            except requests.RequestException:
                print(f"IMERG monthly: {futures[future]} failed; rerun to retry", flush=True)
                continue
            raw["granules"] = [r for r in raw["granules"] if r["period"] != row["period"]]
            raw["granules"].append(row)
            raw["granules"].sort(key=lambda record: record["period"])
            raw_path.write_text(json.dumps(raw, indent=2, allow_nan=False) + "\n")
            print(f"IMERG monthly: {len(raw['granules'])}/216 captured", flush=True)
    expected = {f"{year}-{month:02}" for year in range(2008, 2026) for month in range(1, 13)}
    if (
        len(raw["granules"]) != len(available)
        or {r["period"] for r in raw["granules"]} != available
        or any("subsets" not in r for r in raw["granules"])
    ):
        raise ValueError("IMERG capture is incomplete or contains duplicate months; rerun to retry")
    raw["search"] = {"short_name": PRODUCT, "version": VERSION, "temporal": [START, END]}
    raw["available_months"] = sorted(available)
    raw["missing_provider_months"] = sorted(expected - available)
    raw_path.write_text(json.dumps(raw, indent=2, allow_nan=False) + "\n")
    write_captures(raw)


if __name__ == "__main__":
    main()
