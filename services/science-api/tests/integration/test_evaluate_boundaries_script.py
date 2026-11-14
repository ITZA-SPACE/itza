"""The real-imagery evaluation script (#81), run end to end against the synthetic landscape."""

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from shapely.geometry import mapping

from itza_science.geo.evaluation import load_results, render_report, result_key, summarize
from itza_science.terrain.service import SpatialService
from tests.boundary_support import FIELDS, LandscapeSource

pytestmark = pytest.mark.integration
SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "evaluate_boundaries.py"
PERIOD = {"start": "2024-09-01", "end": "2025-05-31"}


def _script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("evaluate_boundaries", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_refs(path: Path, **props: str) -> None:
    base = {"imagery": "synthetic landscape", "date": "2025-01-01", **props}
    path.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "region": "Synthetic",
                "features": [
                    {"type": "Feature", "properties": {"name": n, **base}, "geometry": mapping(p)}
                    for n, p in FIELDS.items()
                ],
            }
        )
    )


def test_script_scores_reports_and_resumes(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(tmp_path, LandscapeSource())
    script = _script()
    script.__dict__["POLL_S"] = 0.01  # poll fast; the synthetic jobs finish at once
    refs = tmp_path / "refs.geojson"
    _write_refs(refs)
    reference_set = script.load_reference_set(refs)
    assert reference_set.region == "Synthetic"
    assert set(reference_set.outlines) == set(FIELDS)

    out = tmp_path / "run.jsonl"
    run = script.Run(period=PERIOD, per_side=3, threshold=0.85, out=out)
    results = script.evaluate(client, reference_set, run)
    assert len(results) == 9 * len(FIELDS)
    assert {r.outcome for r in results} <= {"accepted", "rejected", "no_proposal"}
    assert all(r.reason and r.kind for r in results if r.outcome == "no_proposal")

    summary = summarize(reference_set.region, results)
    assert summary.clicks == len(results)
    text = render_report([summary], 0.85)
    assert "| Synthetic |" in text

    # An interrupted run continues from its file: nothing is asked again.
    saved = load_results(out.read_text())
    assert saved == results
    resumed = script.Run(
        period=PERIOD,
        per_side=3,
        threshold=0.85,
        done={result_key(r): r for r in saved},
    )
    client.app.state.spatial = None  # any new request would fail
    assert script.evaluate(client, reference_set, resumed) == results


def test_script_rejects_unusable_reference_files(tmp_path: Path) -> None:
    refs = tmp_path / "refs.geojson"
    refs.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    with pytest.raises(SystemExit, match="FeatureCollection"):
        _script().load_reference_set(refs)
    _write_refs(refs, imagery="")
    with pytest.raises(SystemExit, match="imagery"):
        _script().load_reference_set(refs)
