"""Score click-to-field on real HLS scenes against hand-drawn reference outlines (issue #81).

Usage (needs Earthdata credentials in services/science-api/.env or ~/.netrc, and network access):

    uv run python scripts/evaluate_boundaries.py \\
        ../../fixtures/boundaries/reference/setif.geojson \\
        ../../fixtures/boundaries/reference/akron.geojson \\
        --start 2024-10-01 --end 2025-06-30 --per-side 3 --out runs/boundaries.jsonl

Each reference file is a FeatureCollection of Polygons in longitude/latitude, one per field, with
`name`, `imagery` and `date` properties (see fixtures/boundaries/reference/README.md). For every
outline the script clicks a grid of points inside it, starts a `POST /v1/boundaries` job and counts
the proposal as accepted without edits when its IoU with the outline is at least `--accept-iou`
(default 0.85). The report has one row per region: accepted share, IoU spread and refusals by kind.

The first run over a new place downloads HLS scenes and takes a long time (hours, several GB). Every
click is appended to `--out` as soon as it is scored, and `--resume` skips the clicks already there,
so an interrupted run continues where it stopped and later runs reuse the scene cache.
"""

import argparse
import json
import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from shapely.geometry import shape

from itza_science.api import boundaries
from itza_science.geo.evaluation import (
    MIN_FIELDS,
    ClickResult,
    ReferenceError,
    ReferenceSet,
    check_field_count,
    classify,
    dump_result,
    load_results,
    parse_references,
    render_report,
    result_key,
    sample_clicks,
    summarize,
    worst_fields,
)
from itza_science.main import create_app

POLL_S = 3.0
"""Seconds between polls of a running boundary job."""


def load_reference_set(path: Path) -> ReferenceSet:
    try:
        return parse_references(json.loads(path.read_text()), default_region=path.stem)
    except (ReferenceError, ValueError) as exc:
        raise SystemExit(f"{path}: {exc}") from exc


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


@dataclass
class Run:
    """What one evaluation run asks for and what it already has."""

    period: dict[str, str]
    per_side: int
    threshold: float
    out: Path | None = None
    done: dict[tuple[str, float, float], ClickResult] = field(default_factory=dict)


def score_click(
    client: TestClient, name: str, click: tuple[float, float], reference: Any, run: Run
) -> ClickResult:
    job = run_job(client, {"lon": click[0], "lat": click[1], "period": run.period})
    if job["status"] == "done":
        return classify(name, click, shape(job["proposal"]["geometry"]), reference, run.threshold)
    error = job.get("error") or {}
    result = classify(name, click, None, reference, run.threshold)
    return replace(
        result, reason=str(error.get("message", job["status"])), kind=str(error.get("kind", ""))
    )


def evaluate(client: TestClient, reference_set: ReferenceSet, run: Run) -> list[ClickResult]:
    """Scores every click of a region; clicks already in `run.done` are reused, not asked again."""
    results: list[ClickResult] = []
    for name, reference in reference_set.outlines.items():
        for lon, lat in sample_clicks(reference, run.per_side):
            previous = run.done.get((name, round(lon, 7), round(lat, 7)))
            if previous is not None:
                results.append(previous)
                continue
            result = score_click(client, name, (lon, lat), reference, run)
            results.append(result)
            if run.out:
                with run.out.open("a") as handle:
                    handle.write(dump_result(result) + "\n")
            print(
                f"{reference_set.region}/{name} ({lon:.5f}, {lat:.5f}): "
                f"{result.outcome} {result.iou or result.kind or ''}",
                flush=True,
            )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("references", type=Path, nargs="+", help="one GeoJSON file per region")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--per-side", type=int, default=3)
    parser.add_argument("--accept-iou", type=float, default=0.85)
    parser.add_argument("--timeout-s", type=float, default=3600)
    parser.add_argument("--min-fields", type=int, default=MIN_FIELDS)
    parser.add_argument("--out", type=Path, help="JSON lines, one scored click per line")
    parser.add_argument("--resume", action="store_true", help="skip clicks already in --out")
    args = parser.parse_args()

    sets = [load_reference_set(path) for path in args.references]
    for reference_set in sets:
        try:
            check_field_count(reference_set, args.min_fields)
        except ReferenceError as exc:
            raise SystemExit(str(exc)) from exc
    run = Run(
        period={"start": args.start, "end": args.end},
        per_side=args.per_side,
        threshold=args.accept_iou,
        out=args.out,
    )
    if args.out and args.out.exists():
        if not args.resume:
            raise SystemExit(f"{args.out} exists; pass --resume to continue it or remove it")
        run.done = {result_key(r): r for r in load_results(args.out.read_text())}

    boundaries.JOB_TIMEOUT_S = args.timeout_s  # a cold cache downloads many scenes
    summaries = []
    with TestClient(create_app()) as client:
        for reference_set in sets:
            results = evaluate(client, reference_set, run)
            summaries.append(summarize(reference_set.region, results))
            weakest = ", ".join(f"{n} ({s:.0%})" for n, s in worst_fields(results))
            print(f"\nWeakest fields in {reference_set.region}: {weakest}")
    print("\n" + render_report(summaries, args.accept_iou))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
