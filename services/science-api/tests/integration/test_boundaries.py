import asyncio
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from shapely.geometry import shape

from itza_science.adapters.base import Period
from itza_science.api import boundaries
from itza_science.api.boundaries import BoundaryProposal
from itza_science.terrain.grid import Grid
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import Inputs
from tests.boundary_support import CENTER, FIELDS, LandscapeSource

pytestmark = pytest.mark.integration
PERIOD = {"start": "2024-01-01", "end": "2025-12-31"}
ACCEPT_IOU = 0.85
"""A proposal counts as accepted without edits when it overlaps the true outline this much."""


def install(client: TestClient, tmp_path: Path, source: LandscapeSource | None = None) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(tmp_path, source or LandscapeSource())


def post(client: TestClient, lon: float, lat: float) -> Any:
    return client.post("/v1/boundaries", json={"lon": lon, "lat": lat, "period": PERIOD})


def test_boundary_matches_the_schema_and_the_field(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    truth = FIELDS["cereal-a"]
    response = post(client, truth.centroid.x, truth.centroid.y)
    assert response.status_code == 200, response.text
    body = response.json()
    Draft202012Validator(BoundaryProposal.model_json_schema()).validate(body)
    outline = shape(body["geometry"])
    assert outline.is_valid
    assert outline.contains(truth.centroid)
    assert body["method"] == "hls-temporal-segmentation"
    assert body["resolution_m"] == 30
    assert body["sources"]
    assert body["period"] == PERIOD
    assert body["confidence"] in {"high", "medium"}


def test_default_period_is_used_when_omitted(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    truth = FIELDS["cereal-d"]
    response = client.post(
        "/v1/boundaries", json={"lon": truth.centroid.x, "lat": truth.centroid.y}
    )
    assert response.status_code == 200, response.text


def test_click_on_a_track_is_unprocessable(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    response = post(client, CENTER[0], CENTER[1] + 0.0017)
    assert response.status_code == 422


def test_sparse_imagery_is_unprocessable(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path, LandscapeSource(months=2))
    response = post(client, *CENTER)
    assert response.status_code == 422
    assert "too few" in response.json()["detail"]


@pytest.mark.parametrize(
    "body",
    [
        {"lon": 181, "lat": 0},
        {"lon": 0, "lat": 91},
        {"lon": 0, "lat": 0, "extra": 1},
        {"lon": 0, "lat": 0, "period": {"start": "2000-01-01", "end": "2024-01-01"}},
    ],
)
def test_invalid_requests_are_rejected(
    client: TestClient, tmp_path: Path, body: dict[str, object]
) -> None:
    install(client, tmp_path)
    assert client.post("/v1/boundaries", json=body).status_code == 422


def test_polar_point_is_unprocessable(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    response = client.post("/v1/boundaries", json={"lon": 0, "lat": 83.9, "period": PERIOD})
    assert response.status_code == 422


def test_slow_imagery_times_out(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Slow(LandscapeSource):
        async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
            await asyncio.sleep(1)
            return await super().series(grid, period, field_key)

    install(client, tmp_path, Slow())
    monkeypatch.setattr(boundaries, "TIMEOUT_S", 0.05)
    response = post(client, *CENTER)
    assert response.status_code == 504


def test_evaluation_clicks_inside_fields_are_accepted_without_edits(
    client: TestClient, tmp_path: Path
) -> None:
    """F-24 acceptance: at least 70 % of test clicks give a boundary needing no edits."""
    install(client, tmp_path)
    accepted = total = 0
    for truth in FIELDS.values():
        west, south, east, north = truth.bounds
        for fx in np.linspace(0.2, 0.8, 3):
            for fy in np.linspace(0.2, 0.8, 3):
                lon, lat = west + fx * (east - west), south + fy * (north - south)
                total += 1
                response = post(client, lon, lat)
                if response.status_code != 200:
                    continue
                outline = shape(response.json()["geometry"])
                iou = outline.intersection(truth).area / outline.union(truth).area
                accepted += iou >= ACCEPT_IOU
    assert total == 36
    assert accepted / total >= 0.7, f"{accepted}/{total} accepted"
