import asyncio
import time
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
from itza_science.api.boundaries import BoundaryJob, BoundaryProposal
from itza_science.contracts.common_schema import Period as PeriodModel
from itza_science.terrain.grid import Grid
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import Inputs
from tests.boundary_support import CENTER, FIELDS, LandscapeSource

pytestmark = pytest.mark.integration
PERIOD = {"start": "2024-09-01", "end": "2025-05-31"}
ACCEPT_IOU = 0.85
"""A proposal counts as accepted without edits when it overlaps the true outline this much."""


def install(client: TestClient, tmp_path: Path, source: LandscapeSource | None = None) -> None:
    assert isinstance(client.app, FastAPI)
    client.app.state.spatial = SpatialService(tmp_path, source or LandscapeSource())


def wait(client: TestClient, job: dict[str, Any]) -> dict[str, Any]:
    """Polls a started job until it is no longer running."""
    deadline = time.monotonic() + 30
    while job["status"] == "running":
        assert time.monotonic() < deadline, "job did not finish"
        time.sleep(0.01)
        response = client.get(f"/v1/boundaries/{job['id']}")
        assert response.status_code == 200
        job = response.json()
    return job


def run(client: TestClient, lon: float, lat: float, period: dict[str, str] | None = PERIOD) -> Any:
    body: dict[str, Any] = {"lon": lon, "lat": lat}
    if period is not None:
        body["period"] = period
    response = client.post("/v1/boundaries", json=body)
    assert response.status_code == 202, response.text
    return wait(client, response.json())


def test_job_finishes_with_a_proposal_matching_the_schema_and_field(
    client: TestClient, tmp_path: Path
) -> None:
    install(client, tmp_path)
    truth = FIELDS["cereal-a"]
    job = run(client, truth.centroid.x, truth.centroid.y)
    assert job["status"] == "done", job
    Draft202012Validator(BoundaryJob.model_json_schema()).validate(job)
    proposal = job["proposal"]
    Draft202012Validator(BoundaryProposal.model_json_schema()).validate(proposal)
    outline = shape(proposal["geometry"])
    assert outline.is_valid
    assert outline.contains(truth.centroid)
    assert proposal["method"] == "hls-temporal-segmentation"
    assert proposal["resolution_m"] == 30
    assert proposal["sources"]
    assert proposal["period"] == PERIOD
    assert proposal["confidence"] in {"high", "medium"}
    assert job["error"] is None


def test_start_answers_at_once_before_the_imagery_is_read(
    client: TestClient, tmp_path: Path
) -> None:
    class Slow(LandscapeSource):
        async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
            await asyncio.sleep(0.3)
            return await super().series(grid, period, field_key)

    install(client, tmp_path, Slow())
    started = time.monotonic()
    response = client.post("/v1/boundaries", json={"lon": CENTER[0], "lat": CENTER[1] + 0.001})
    assert response.status_code == 202
    assert time.monotonic() - started < 0.25
    assert response.json()["status"] == "running"


def test_progress_counts_the_date_windows_read(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    truth = FIELDS["summer-b"]
    job = run(client, truth.centroid.x, truth.centroid.y)
    total = len(boundaries.sample_windows(PeriodModel(**PERIOD)))
    assert job["progress"] == {"done": total, "total": total}


def test_default_period_is_used_when_omitted(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    truth = FIELDS["cereal-d"]
    job = run(client, truth.centroid.x, truth.centroid.y, None)
    assert job["status"] == "done", job
    assert job["proposal"]["period"]["end"] == time.strftime("%Y-%m-%d")


def test_default_period_is_one_season_ending_today(client: TestClient, tmp_path: Path) -> None:
    source = LandscapeSource()
    install(client, tmp_path, source)
    truth = FIELDS["cereal-d"]
    run(client, truth.centroid.x, truth.centroid.y, None)
    span = (source.calls[-1].end - source.calls[0].start).days
    assert span == boundaries.DEFAULT_PERIOD_DAYS
    assert boundaries.DEFAULT_PERIOD_DAYS <= boundaries.MAX_PERIOD_DAYS


def test_same_click_shares_one_job(client: TestClient, tmp_path: Path) -> None:
    source = LandscapeSource()
    install(client, tmp_path, source)
    truth = FIELDS["cereal-a"]
    body = {"lon": truth.centroid.x, "lat": truth.centroid.y, "period": PERIOD}
    first = client.post("/v1/boundaries", json=body).json()
    wait(client, first)
    calls = len(source.calls)
    second = client.post("/v1/boundaries", json=body)
    assert second.status_code == 202
    assert second.json()["id"] == first["id"]
    assert second.json()["status"] == "done"
    assert len(source.calls) == calls  # the finished proposal is reused, nothing is read again


def test_click_on_a_track_ends_in_a_no_field_error(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    job = run(client, CENTER[0], CENTER[1] + 0.0017)
    assert job["status"] == "error"
    assert job["error"]["kind"] == "no-field"
    assert job["proposal"] is None


def test_failed_job_is_restarted_by_the_next_start(client: TestClient, tmp_path: Path) -> None:
    source = LandscapeSource(limit=2)
    install(client, tmp_path, source)
    failed = run(client, *CENTER)
    assert failed["error"]["kind"] == "no-field"
    assert "too few" in failed["error"]["message"]
    source.limit = None
    restarted = run(client, *CENTER)
    assert restarted["id"] == failed["id"]
    assert restarted["status"] != "running"
    assert len(source.calls) == 2 * len(boundaries.sample_windows(PeriodModel(**PERIOD)))


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


def test_polar_point_ends_in_an_error(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    job = run(client, 0, 83.9)
    assert job["status"] == "error"
    assert job["error"]["kind"] == "no-field"


def test_period_that_would_read_too_much_imagery_is_refused_before_any_job(
    client: TestClient, tmp_path: Path
) -> None:
    source = LandscapeSource()
    install(client, tmp_path, source)
    response = client.post(
        "/v1/boundaries",
        json={"lon": 5.33, "lat": 36.12, "period": {"start": "2024-01-01", "end": "2025-12-31"}},
    )
    assert response.status_code == 422
    assert "too much imagery" in response.text
    assert source.calls == []  # refused before any imagery was requested


def test_slow_imagery_ends_in_a_timeout_error(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Slow(LandscapeSource):
        async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
            await asyncio.sleep(1)
            return await super().series(grid, period, field_key)

    install(client, tmp_path, Slow())
    monkeypatch.setattr(boundaries, "JOB_TIMEOUT_S", 0.05)
    job = run(client, *CENTER)
    assert job["status"] == "error"
    assert job["error"]["kind"] == "timeout"


def test_unexpected_failure_ends_in_an_unavailable_error(
    client: TestClient, tmp_path: Path
) -> None:
    class Broken(LandscapeSource):
        async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
            raise RuntimeError("secret upstream detail")

    install(client, tmp_path, Broken())
    job = run(client, *CENTER)
    assert job["error"]["kind"] == "unavailable"
    assert "secret" not in job["error"]["message"]


def test_unknown_or_malformed_job_ids(client: TestClient, tmp_path: Path) -> None:
    install(client, tmp_path)
    assert client.get("/v1/boundaries/0123456789abcdef").status_code == 404
    assert client.get("/v1/boundaries/not-an-id").status_code == 422


def test_full_store_refuses_new_jobs_but_evicts_finished_ones(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Gated(LandscapeSource):
        slow = True

        async def series(self, grid: Grid, period: Period, field_key: str) -> Inputs:
            if self.slow:
                await asyncio.sleep(0.2)
            return await super().series(grid, period, field_key)

    source = Gated()
    monkeypatch.setattr(boundaries, "MAX_JOBS", 1)
    install(client, tmp_path, source)
    first = client.post("/v1/boundaries", json={"lon": 5.3, "lat": 36.1})
    assert first.status_code == 202
    busy = client.post("/v1/boundaries", json={"lon": 5.4, "lat": 36.2})
    assert busy.status_code == 503

    source.slow = False  # let the running job finish, then it may be evicted
    wait(client, first.json())
    assert client.post("/v1/boundaries", json={"lon": 5.41, "lat": 36.21}).status_code == 202
    assert client.get(f"/v1/boundaries/{first.json()['id']}").status_code == 404


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
                job = run(client, lon, lat)
                if job["status"] != "done":
                    continue
                outline = shape(job["proposal"]["geometry"])
                iou = outline.intersection(truth).area / outline.union(truth).area
                accepted += iou >= ACCEPT_IOU
    assert total == 36
    assert accepted / total >= 0.7, f"{accepted}/{total} accepted"
