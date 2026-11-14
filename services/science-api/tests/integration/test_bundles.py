import json
import time
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.contracts.canonical_series_schema import Var
from tests.recorded_support import RecordedReader, recorded_clips
from tests.support import GRANULE_FIXTURES, FakeGranuleReader

pytestmark = pytest.mark.integration

FIELD = {
    "type": "Polygon",
    "coordinates": [
        [
            [5.32804, 36.11842],
            [5.33196, 36.11842],
            [5.33196, 36.12158],
            [5.32804, 36.12158],
            [5.32804, 36.11842],
        ]
    ],
}
PERIOD = {"start": "2026-01-01", "end": "2026-01-02"}


def _wait_for_done(client: TestClient, bundle_id: str) -> dict[str, Any]:
    for _ in range(50):
        body: dict[str, Any] = client.get(f"/v1/bundles/{bundle_id}").json()
        if body["status"] in ("done", "error"):
            return body
        time.sleep(0.02)
    pytest.fail("bundle job never finished")


def _install_fixture_adapters(client: TestClient) -> None:
    reader = FakeGranuleReader(
        files={
            ("GPM_3IMERGDF", date(2026, 1, 1)): GRANULE_FIXTURES / "imerg_final_clear.nc",
            ("GPM_3IMERGDF", date(2026, 1, 2)): GRANULE_FIXTURES / "imerg_final_clear.nc",
            ("SPL4SMGP", date(2026, 1, 1)): GRANULE_FIXTURES / "smap_l4_clear.nc",
            ("SPL4SMGP", date(2026, 1, 2)): GRANULE_FIXTURES / "smap_l4_clear.nc",
            ("HLSL30_VI", date(2026, 1, 1)): GRANULE_FIXTURES / "hls_vi_clear.tif",
            ("HLSL30_VI", date(2026, 1, 2)): GRANULE_FIXTURES / "hls_vi_clear.tif",
        }
    )
    app = client.app
    assert isinstance(app, FastAPI)
    app.state.bundle_adapters = [
        ImergAdapter(reader),
        SmapL4Adapter(reader),
        HlsViAdapter(reader),
    ]


def test_create_poll_and_fetch_series(client: TestClient) -> None:
    _install_fixture_adapters(client)
    created = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    assert created.status_code == 200
    bundle_id = created.json()["id"]
    assert created.json()["status"] in ("queued", "running", "done")

    status = _wait_for_done(client, bundle_id)
    assert status["status"] == "done"
    assert status["field"]["area_ha"] == pytest.approx(12.4, abs=0.1)
    assert set(status["adapters"]) == {"gpm_imerg_final_daily", "smap_l4", "hls_vi"}

    series = client.get(f"/v1/bundles/{bundle_id}/series/precip")
    assert series.status_code == 200
    assert series.json()["provenance"]["source"] == "gpm_imerg_final_daily"
    assert len(series.json()["values"]) == 2


def test_repeated_identical_request_is_idempotent(client: TestClient) -> None:
    _install_fixture_adapters(client)
    first = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    _wait_for_done(client, first.json()["id"])
    second = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["status"] == "done"


def test_oversized_polygon_is_rejected(client: TestClient) -> None:
    huge = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [170, 0], [170, 80], [0, 80], [0, 0]]],
    }
    response = client.post("/v1/bundles", json={"geometry": huge, "period": PERIOD})
    assert response.status_code == 422


def test_invalid_latitude_is_rejected(client: TestClient) -> None:
    bad = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [1, 0], [1, 95], [0, 95], [0, 0]]],
    }
    response = client.post("/v1/bundles", json={"geometry": bad, "period": PERIOD})
    assert response.status_code == 422


def test_period_too_long_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/v1/bundles",
        json={"geometry": FIELD, "period": {"start": "2000-01-01", "end": "2026-01-01"}},
    )
    assert response.status_code == 422


def test_unsupported_variable_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/v1/bundles", json={"geometry": FIELD, "period": PERIOD, "variables": ["tmax"]}
    )
    assert response.status_code == 422


def test_missing_earthdata_credentials_yields_gaps_not_an_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The default app.state.bundle_adapters use the real EarthaccessGranuleReader; force the
    # no-credentials path so every adapter must degrade to gaps, never an error.
    monkeypatch.delenv("EARTHDATA_USERNAME", raising=False)
    monkeypatch.delenv("EARTHDATA_PASSWORD", raising=False)
    created = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    bundle_id = created.json()["id"]
    status = _wait_for_done(client, bundle_id)
    assert status["status"] == "done"
    assert status["adapters"] == []
    reasons = {g["reason"] for g in status["gaps"]}
    assert any("credentials" in reason for reason in reasons)


def test_unknown_bundle_id_is_404(client: TestClient) -> None:
    assert client.get(f"/v1/bundles/{'0' * 64}").status_code == 404
    assert client.get(f"/v1/bundles/{'0' * 64}/series/precip").status_code == 404


def test_series_not_in_bundle_is_404(client: TestClient) -> None:
    _install_fixture_adapters(client)
    created = client.post(
        "/v1/bundles", json={"geometry": FIELD, "period": PERIOD, "variables": ["precip"]}
    )
    bundle_id = created.json()["id"]
    _wait_for_done(client, bundle_id)
    response = client.get(f"/v1/bundles/{bundle_id}/series/ndvi")
    assert response.status_code == 404


def test_errored_job_is_retried_on_next_request(client: TestClient) -> None:
    _install_fixture_adapters(client)
    app = client.app
    assert isinstance(app, FastAPI)
    working = app.state.bundle_adapters

    class Boom:
        def capabilities(self) -> Any:
            return working[0].capabilities()

        async def fetch(self, *_args: Any) -> Any:
            raise RuntimeError("upstream exploded")

    app.state.bundle_adapters = [Boom()]
    bundle_id = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD}).json()["id"]
    assert _wait_for_done(client, bundle_id)["status"] == "error"

    app.state.bundle_adapters = working
    retried = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    assert retried.json()["id"] == bundle_id
    assert _wait_for_done(client, bundle_id)["status"] == "done"


def test_recorded_nasa_granules_build_a_schema_valid_bundle(client: TestClient) -> None:
    clips = recorded_clips()
    reference = next(c for c in clips if c.collection == "HLSS30_VI")
    request = reference.request()
    request.period.start = min(c.day for c in clips)
    request.period.end = max(c.day for c in clips)
    request.variables = [Var.precip, Var.sm_surface, Var.sm_rootzone, Var.ndvi]
    reader = RecordedReader()
    app = client.app
    assert isinstance(app, FastAPI)
    app.state.bundle_adapters = [ImergAdapter(reader), SmapL4Adapter(reader), HlsViAdapter(reader)]
    created = client.post("/v1/bundles", json=request.model_dump(mode="json"))
    assert created.status_code == 200
    bundle_id = created.json()["id"]
    status = _wait_for_done(client, bundle_id)
    assert status["status"] == "done"
    assert set(status["adapters"]) == {"gpm_imerg_final_daily", "smap_l4", "hls_vi"}
    raw = app.state.cache.get("bundles", bundle_id)
    assert raw["field"]["elevation_m"] is None
    assert raw["field"]["slope_mean_deg"] is None
    _validate_bundle_schema(raw)
    observed = client.get(f"/v1/bundles/{bundle_id}/series/precip").json()
    final = next(c for c in clips if c.collection == "GPM_3IMERGDF")
    index = (final.day - request.period.start).days
    assert observed["values"][index] == pytest.approx(final.expected["precip"])
    assert observed["provenance"]["source"] == "gpm_imerg_final_daily"
    for variable in request.variables:
        series = client.get(f"/v1/bundles/{bundle_id}/series/{variable.value}").json()
        assert any(value is not None for value in series["values"])
        assert series["provenance"]["retrieved"]


def test_cache_write_failure_is_safe_and_the_job_can_be_retried(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fixture_adapters(client)
    app = client.app
    assert isinstance(app, FastAPI)
    write = app.state.cache.set

    def fail(*args: object, **kwargs: object) -> None:
        raise OSError("secret-in-cache-error")

    monkeypatch.setattr(app.state.cache, "set", fail)
    response = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    job_id = response.json()["id"]
    status = _wait_for_done(client, job_id)
    assert status["status"] == "error"
    assert status["error"] == "Bundle processing failed"
    monkeypatch.setattr(app.state.cache, "set", write)
    retried = client.post("/v1/bundles", json={"geometry": FIELD, "period": PERIOD})
    assert retried.json()["id"] == job_id
    assert _wait_for_done(client, job_id)["status"] == "done"


def test_explicit_refresh_rebuilds_a_cached_bundle(client: TestClient) -> None:
    _install_fixture_adapters(client)
    body = {"geometry": FIELD, "period": PERIOD}
    first = client.post("/v1/bundles", json=body)
    job_id = first.json()["id"]
    generated = _wait_for_done(client, job_id)["generated_at"]
    again = client.post("/v1/bundles", json=body)
    assert again.json()["status"] == "done"
    assert _wait_for_done(client, job_id)["generated_at"] == generated
    refreshed = client.post("/v1/bundles", json={**body, "refresh": True})
    assert refreshed.json()["id"] == job_id
    assert _wait_for_done(client, job_id)["generated_at"] != generated


def _validate_bundle_schema(document: dict[str, Any]) -> None:
    folder = Path(__file__).resolve().parents[4] / "schemas"
    registry: Registry = Registry()
    for path in folder.glob("*.schema.json"):
        schema = json.loads(path.read_text())
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    schema = json.loads((folder / "field-bundle.schema.json").read_text())
    Draft202012Validator(schema, registry=registry, format_checker=FormatChecker()).validate(
        document
    )


@pytest.mark.parametrize("bad", ["missing", "..", "g" * 64, "a" * 63, "A" * 64])
@pytest.mark.parametrize("suffix", ["", "/soil", "/series/precip"])
def test_invalid_bundle_identifier(client: TestClient, bad: str, suffix: str) -> None:
    # Dot segments are normalized by HTTP clients, so use a non-normalizing invalid identifier.
    if bad == "..":
        bad = "a..b"
    assert client.get(f"/v1/bundles/{bad}{suffix}").status_code == 422
