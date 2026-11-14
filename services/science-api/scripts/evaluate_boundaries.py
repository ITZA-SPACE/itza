"""Score click-to-field on real HLS scenes against hand-drawn reference outlines (issue #81).

Usage (needs Earthdata credentials in services/science-api/.env and network access):

    uv run python scripts/evaluate_boundaries.py references.geojson \\
        --start 2024-10-01 --end 2025-06-30 --per-side 3 --out report.json

`references.geojson` is a FeatureCollection of Polygons in longitude/latitude, one per field,
each with a `name` property. For every outline the script clicks a grid of points inside it,
asks `POST /v1/boundaries` for a proposal and counts it as accepted without edits when its IoU
with the outline is at least `--accept-iou` (default 0.85). The first run over a new place
downloads HLS scenes and can take a long time; later runs reuse the cache.
"""

import argparse
import json
import sys
import time
from collections import Counter
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from shapely.geometry import Polygon, shape

from itza_science.api import boundaries
from itza_science.geo.evaluation import ClickResult, acceptance_rate, classify, sample_clicks
from itza_science.main import create_app

TARGET = 0.7
POLL_S = 3.0
"""Seconds between polls of a running boundary job."""


def load_references(path: Path) -> dict[str, Polygon]:
    collection = json.loads(path.read_text())
    references: dict[str, Polygon] = {}
    for index, feature in enumerate(collection["features"]):
        outline = shape(feature["geometry"])
        if not isinstance(outline, Polygon) or not outline.is_valid or outline.is_empty:
            raise SystemExit(f"feature {index} is not a valid Polygon")
        references[str(feature.get("properties", {}).get("name", f"field-{index + 1}"))] = outline
    if not references:
        raise SystemExit("no reference outlines found")
    return references


def run_job(client: TestClient, body: dict[str, object]) -> dict[str, Any]:
    """Starts a boundary job and polls it until it is done or has failed."""
    response = client.post("/v1/boundaries", json=body)
    response.raise_for_status()
    job: dict[str, Any] = response.json()
    while job["status"] == "running":
        time.sleep(POLL_S)
        poll = client.get(f"/v1/boundaries/{job['id']}")
        poll.raise_for_status()
        job = poll.json()
        progress = job["progress"]
        print(f"  progress {progress['done']}/{progress['total']}", flush=True)
    return job


def evaluate(
    client: TestClient,
    references: dict[str, Polygon],
    period: dict[str, str],
    per_side: int,
    threshold: float,
) -> list[ClickResult]:
    results: list[ClickResult] = []
    for name, reference in references.items():
        for lon, lat in sample_clicks(reference, per_side):
            job = run_job(client, {"lon": lon, "lat": lat, "period": period})
            done = job["status"] == "done"
            proposal = shape(job["proposal"]["geometry"]) if done else None
            result = classify(name, (lon, lat), proposal, reference, threshold)
            if proposal is None:
                error = job.get("error") or {}
                result = replace(result, reason=str(error.get("message", job["status"])))
            results.append(result)
            print(f"{name} ({lon:.5f}, {lat:.5f}): {result.outcome} {result.iou or ''}", flush=True)
    return results


def report(results: list[ClickResult], threshold: float) -> str:
    lines = [f"Accepted without edits (IoU >= {threshold}): {acceptance_rate(results):.0%}", ""]
    lines += ["| Field | Clicks | Accepted | Median IoU |", "|---|---|---|---|"]
    for name in dict.fromkeys(r.field for r in results):
        own = [r for r in results if r.field == name]
        scores = sorted(r.iou for r in own if r.iou is not None)
        median = f"{scores[len(scores) // 2]:.2f}" if scores else "n/a"
        lines.append(f"| {name} | {len(own)} | {acceptance_rate(own):.0%} | {median} |")
    reasons = Counter(r.reason for r in results if r.outcome == "no_proposal")
    if reasons:
        lines += ["", "No proposal:"] + [
            f"- {reason}: {count}" for reason, count in reasons.items()
        ]
    verdict = "meets" if acceptance_rate(results) >= TARGET else "misses"
    return "\n".join([*lines, "", f"This {verdict} the 70 % target (F-24)."])


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("references", type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--per-side", type=int, default=3)
    parser.add_argument("--accept-iou", type=float, default=0.85)
    parser.add_argument("--timeout-s", type=float, default=3600)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    boundaries.JOB_TIMEOUT_S = args.timeout_s  # a cold cache downloads many scenes
    references = load_references(args.references)
    with TestClient(create_app()) as client:
        results = evaluate(
            client,
            references,
            {"start": args.start, "end": args.end},
            args.per_side,
            args.accept_iou,
        )
    print("\n" + report(results, args.accept_iou))
    if args.out:
        args.out.write_text(json.dumps([asdict(r) for r in results], indent=2))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
