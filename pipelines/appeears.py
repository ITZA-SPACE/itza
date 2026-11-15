"""MODIS NDVI and ET at the hero centroids from NASA AppEEARS, as one cached point task.

The ORNL MODIS point service answers 10 dates per request; AppEEARS returns the same LP DAAC
MOD13Q1 and MOD16A2GF values for every hero and every date in one task. This module waits for
a submitted task, downloads its CSV tables and writes `modis.json`:

    {hero_id: {"ndvi": {date: [ndvi, reliability]}, "et": {date: [et_mm_per_composite, qc]}}}

AppEEARS CSV values are already scaled (NDVI as a fraction, ET in kg/m2 per composite).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

API = "https://appeears.earthdatacloud.nasa.gov/api"
NDVI = "MOD13Q1_061__250m_16_days_NDVI"
RELIABILITY = "MOD13Q1_061__250m_16_days_pixel_reliability"
ET = "MOD16A2GF_061_ET_500m"
ET_QC = "MOD16A2GF_061_ET_QC_500m"
Modis = dict[str, dict[str, dict[str, list[float]]]]


def parse_tables(tables: list[str]) -> Modis:
    """Merge AppEEARS point CSVs into per-hero NDVI and ET composites keyed by ISO date."""
    out: Modis = {}
    for text in tables:
        for row in csv.DictReader(io.StringIO(text)):
            hero = out.setdefault(row["ID"], {"ndvi": {}, "et": {}})
            day = row["Date"][:10]
            if row.get(NDVI) not in (None, "") and row.get(RELIABILITY) not in (None, ""):
                hero["ndvi"][day] = [float(row[NDVI]), float(row[RELIABILITY])]
            if row.get(ET) not in (None, "") and row.get(ET_QC) not in (None, ""):
                hero["et"][day] = [float(row[ET]), float(row[ET_QC])]
    return out


def login(client: httpx.Client) -> dict[str, str]:
    user, password = os.environ["EARTHDATA_USERNAME"], os.environ["EARTHDATA_PASSWORD"]
    response = client.post(f"{API}/login", auth=(user, password)).raise_for_status()
    return {"Authorization": f"Bearer {response.json()['token']}"}


def fetch(task_id: str, cache: Path, poll_seconds: int = 30) -> Modis:
    """Wait for the task, download its CSV tables once (cached), and parse them."""
    folder = cache / "appeears" / task_id
    if not (folder / "done").exists():
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            headers = login(client)
            while True:
                try:
                    status = client.get(f"{API}/task/{task_id}", headers=headers)
                    status.raise_for_status()
                except httpx.HTTPError as error:
                    # The task runs on NASA's side; a network blip here must not end the wait.
                    print(f"AppEEARS poll failed ({type(error).__name__}); retrying", flush=True)
                    time.sleep(poll_seconds)
                    continue
                state = status.json()["status"]
                print(f"AppEEARS task {task_id}: {state}", flush=True)
                if state == "done":
                    break
                if state in ("error", "expired", "deleted"):
                    raise RuntimeError(f"AppEEARS task ended as {state}")
                time.sleep(poll_seconds)
            bundle = client.get(f"{API}/bundle/{task_id}", headers=headers).raise_for_status()
            folder.mkdir(parents=True, exist_ok=True)
            for item in bundle.json()["files"]:
                if item["file_name"].endswith("-results.csv"):
                    url = f"{API}/bundle/{task_id}/{item['file_id']}"
                    payload = client.get(url, headers=headers).raise_for_status().content
                    (folder / Path(item["file_name"]).name).write_bytes(payload)
        (folder / "done").write_text("ok\n")
    return parse_tables([p.read_text() for p in sorted(folder.glob("*-results.csv"))])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task_id")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    data = fetch(args.task_id, args.cache)
    args.out.write_text(json.dumps(data, separators=(",", ":")))
    for hero, values in data.items():
        print(f"{hero}: {len(values['ndvi'])} NDVI and {len(values['et'])} ET composites")


def load(path: Path | None) -> Modis | None:
    if path is None:
        return None
    data: Any = json.loads(path.read_text())
    return data  # type: ignore[no-any-return]


if __name__ == "__main__":
    main()
