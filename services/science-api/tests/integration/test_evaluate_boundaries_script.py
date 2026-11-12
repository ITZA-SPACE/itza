"""The real-imagery evaluation script (#81), run end to end against the synthetic landscape."""

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from shapely.geometry import mapping

from itza_science.terrain.service import SpatialService
from tests.boundary_support import FIELDS, LandscapeSource

pytestmark = pytest.mark.integration
SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "evaluate_boundaries.py"
PERIOD = {"start": "2024-01-01", "end": "2025-12-31"}


def _script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("evaluate_boundaries", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_script_scores_reference_outlines_and_reports(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(tmp_path, LandscapeSource())
    script = _script()
    refs = tmp_path / "refs.geojson"
    refs.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "properties": {"name": n}, "geometry": mapping(p)}
                    for n, p in FIELDS.items()
                ],
            }
        )
    )
    references = script.load_references(refs)
    assert set(references) == set(FIELDS)

    results = script.evaluate(client, references, PERIOD, 3, 0.85)
    assert len(results) == 9 * len(FIELDS)
    assert {r.outcome for r in results} <= {"accepted", "rejected", "no_proposal"}
    assert all(r.reason for r in results if r.outcome == "no_proposal")

    text = script.report(results, 0.85)
    assert "Accepted without edits" in text
    assert all(f"| {name} |" in text for name in FIELDS)


def test_script_rejects_a_file_without_polygons(tmp_path: Path) -> None:
    refs = tmp_path / "refs.geojson"
    refs.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    with pytest.raises(SystemExit, match="no reference outlines"):
        _script().load_references(refs)
