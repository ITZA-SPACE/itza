"""Explicit online capture; build.py and tests never access the network."""

from __future__ import annotations

import csv
import io
import json
import os
import re
from datetime import date
from typing import Any
from urllib.parse import urlencode

import httpx
from build import HERE, Capture, Observation

START, END = "200801", "202512"
QUICKSTATS = "https://quickstats.nass.usda.gov"
PRISM = "https://prism.oregonstate.edu/explorer/dataexplorer/rpc.php"
QUERY = {
    "source_desc": "SURVEY",
    "commodity_desc": "WHEAT",
    "class_desc": "WINTER",
    "statisticcat_desc": "YIELD",
    "agg_level_desc": "COUNTY",
    "state_alpha": "CO",
    "county_name": "WASHINGTON",
    "domain_desc": "TOTAL",
    "freq_desc": "ANNUAL",
    "reference_period_desc": "YEAR",
    "unit_desc": "BU / ACRE",
    "year__GE": "2008",
    "year__LE": "2025",
}


def request(url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        response = client.request(
            "POST" if data is not None else "GET",
            url,
            content=data,
            headers=headers
            or ({"Content-Type": "application/x-www-form-urlencoded"} if data is not None else {}),
        )
        response.raise_for_status()
        return response.content


def parse_quickstats(payload: str) -> list[Observation]:
    observations = []
    for row in csv.DictReader(io.StringIO(payload)):
        # Exclude irrigated subsets, other counties, census records and suppressed values.
        if not all(
            row[key] == value
            for key, value in {
                "Program": "SURVEY",
                "Geo Level": "COUNTY",
                "State ANSI": "08",
                "County ANSI": "121",
                "Period": "YEAR",
                "Domain": "TOTAL",
                "Domain Category": "NOT SPECIFIED",
                "Data Item": "WHEAT, WINTER - YIELD, MEASURED IN BU / ACRE",
            }.items()
        ):
            continue
        year = int(row["Year"])
        if not 2008 <= year <= 2025:
            continue
        text = row["Value"].strip().replace(",", "")
        value = None if text.startswith("(") else float(text)
        observations.append(Observation(period=str(year), value=value))
    return sorted(observations, key=lambda r: r.period)


def save(capture: Capture) -> None:
    path = HERE / f"data/{capture.field}-{capture.source}.json"
    path.write_text(capture.model_dump_json(indent=2) + "\n")


def main() -> None:
    fields = json.loads((HERE / "data/replay.json").read_text())["fields"]
    raw_dir = HERE / "data/raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    # The same export used by the public website's Spreadsheet button; no API key required.
    csv_path = raw_dir / "quickstats.csv"
    url_path = raw_dir / "quickstats-url.txt"
    if csv_path.exists() and url_path.exists():
        url, csv_text = url_path.read_text().strip(), csv_path.read_text()
    else:
        page = request(QUICKSTATS + "/results/", urlencode(QUERY).encode()).decode()
        match = re.search(r'var uuid="([A-F0-9-]+)"', page)
        if not match:
            raise ValueError("QuickStats did not return a public query id")
        url = QUICKSTATS + f"/data/spreadsheet/{match[1]}.csv"
        csv_text = request(url).decode()
        csv_path.write_text(csv_text)
        (raw_dir / "quickstats-retrieved.txt").write_text(date.today().isoformat() + "\n")
        url_path.write_text(url + "\n")
    county_retrieved = date.fromisoformat(
        (raw_dir / "quickstats-retrieved.txt").read_text().strip()
    )
    county = parse_quickstats(csv_text)
    if not county:
        raise ValueError("QuickStats returned no Washington County winter wheat observations")
    (raw_dir / "quickstats-query.json").write_text(json.dumps(QUERY, indent=2) + "\n")
    for field in fields:
        field_id = field["id"]
        lon, lat = field["centroid"]

        params = {
            "proc": "gridserv",
            "call": "pp/monthly_timeseries",
            "lon": str(lon),
            "lat": str(lat),
            "spares": "4km",
            "interp": "0",
            "stats": "ppt",
            "units": "si",
            "range": "monthly",
            "start": START,
            "end": END,
            "stability": "stable",
        }
        response = request(PRISM, urlencode(params).encode())
        (raw_dir / f"{field_id}-prism.json").write_bytes(response)
        parsed = json.loads(response)
        if parsed.get("errors"):
            raise ValueError("PRISM returned an error")
        values = parsed["result"]["data"]["ppt"]
        if len(values) != 18 * 12:
            raise ValueError("PRISM returned an incomplete or changed date range")
        save(
            Capture(
                field=field_id,
                retrieved=date.today(),
                source="prism",
                url=PRISM + "?" + urlencode(params),
                resolution="4 km grid cell containing the sampling-area centroid; monthly",
                unit="mm/month",
                status="ready",
                observations=[
                    Observation(period=f"{2008 + i // 12}-{i % 12 + 1:02}", value=v)
                    for i, v in enumerate(values)
                ],
            )
        )
        save(
            Capture(
                field=field_id,
                retrieved=county_retrieved,
                source="quickstats",
                url=url,
                resolution="Washington County, Colorado (FIPS 08121); annual; all practices",
                unit="bu/acre",
                status="ready",
                observations=county,
            )
        )
        key = os.environ.get("OPENET_API_KEY")
        if not key:
            # Reusing a validated snapshot preserves its original retrieval date and observations.
            # A refresh without credentials must not erase a previously measured comparison.
            previous_path = HERE / f"data/{field_id}-openet.json"
            if previous_path.exists():
                previous = Capture.model_validate_json(previous_path.read_text())
                if previous.source != "openet" or previous.field != field_id:
                    raise ValueError("OpenET capture belongs to another source or field")
                if previous.status == "ready":
                    continue
            # A gap is an observed access condition, never a zero measurement.
            save(
                Capture(
                    field=field_id,
                    retrieved=date.today(),
                    source="openet",
                    url="https://openet-api.org/raster/timeseries/polygon",
                    resolution="30 m ensemble v2.0; sampling-area mean; monthly",
                    unit="mm/month",
                    status="unavailable",
                    reason="openet_key_required",
                    observations=[],
                )
            )
            continue
        bundle_path = HERE.parents[1] / f"apps/web/public/bundles/{field_id}/bundle.json"
        geometry = json.loads(bundle_path.read_text())["field"]["geometry"]
        # OpenET rejects ranges over 10 years: request two windows and join them.
        windows = (("2008-01-01", "2016-12-31"), ("2017-01-01", "2025-12-31"))
        queries: list[dict[str, Any]] = []
        rows: list[dict[str, Any]] = []
        for start, end in windows:
            params_et = {
                "date_range": [start, end],
                "interval": "monthly",
                "geometry": [v for point in geometry["coordinates"][0] for v in point],
                "model": "ensemble",
                "variable": "ET",
                "reference_et": "gridmet",
                "reducer": "mean",
                "units": "mm",
                "version": 2.0,
                "file_format": "JSON",
            }
            window = json.loads(
                request(
                    "https://openet-api.org/raster/timeseries/polygon",
                    json.dumps(params_et).encode(),
                    {"Authorization": key, "Content-Type": "application/json"},
                )
            )
            if not isinstance(window, list):
                raise ValueError("unexpected OpenET response: expected monthly rows")
            queries.append(params_et)
            rows.extend(window)
        payload = json.dumps(rows).encode()
        (raw_dir / f"{field_id}-openet.json").write_bytes(payload)
        (raw_dir / f"{field_id}-openet-query.json").write_text(json.dumps(queries, indent=2) + "\n")
        save(
            Capture(
                field=field_id,
                retrieved=date.today(),
                source="openet",
                url="https://openet-api.org/raster/timeseries/polygon",
                resolution="30 m ensemble v2.0; sampling-area mean; monthly",
                unit="mm/month",
                status="ready",
                observations=[
                    Observation(period=str(row["time"])[:7], value=row["et"]) for row in rows
                ],
            )
        )


if __name__ == "__main__":
    main()
