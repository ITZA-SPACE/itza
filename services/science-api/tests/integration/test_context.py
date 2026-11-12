from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from PIL import Image

from itza_science.context.models import GediResponse, GraceResponse, SceneResponse
from itza_science.context.service import ContextService
from itza_science.terrain.models import Model
from tests.context_support import BOUNDS, DAY, FixtureArchive

pytestmark = pytest.mark.integration
BOX = ",".join(map(str, BOUNDS))
SCENE_PARAMS = {"bbox": BOX, "from": "2026-06-17", "to": "2026-11-12"}
ROUTES: list[tuple[str, dict[str, Any], type[SceneResponse | GraceResponse | GediResponse]]] = [
    ("/v1/nisar", SCENE_PARAMS, SceneResponse),
    ("/v1/context/ecostress", SCENE_PARAMS, SceneResponse),
    ("/v1/context/grace", {"lat": 36.12, "lon": 5.33}, GraceResponse),
    ("/v1/context/gedi", {"bbox": BOX}, GediResponse),
]


def install(client: TestClient, tmp_path: Path, **kwargs: Any) -> FixtureArchive:
    archive = FixtureArchive(**kwargs)
    assert isinstance(client.app, FastAPI)
    client.app.state.context = ContextService(tmp_path, archive)
    return archive


@pytest.mark.parametrize(("route", "params", "model"), ROUTES)
def test_context_present_and_cached(
    client: TestClient,
    tmp_path: Path,
    route: str,
    params: dict[str, Any],
    model: type[SceneResponse | GraceResponse | GediResponse],
) -> None:
    archive = install(client, tmp_path)
    response = client.get(route, params=params)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "ok", result
    Draft202012Validator(model.model_json_schema()).validate(result)
    count = len(archive.queries)
    assert client.get(route, params=params).json() == result
    assert len(archive.queries) == count
    assert client.get(route, params={**params, "refresh": "true"}).status_code == 200
    assert len(archive.queries) > count
    if "scenes" in result:
        for scene in result["scenes"]:
            image = client.get(scene["href"])
            assert image.status_code == 200
            assert len(image.content) == scene["bytes"] <= 150000
            assert Image.open(BytesIO(image.content)).mode == "RGBA"
            assert scene["provenance"]["resolution_m"] > 0
    if route == "/v1/nisar":
        assert result["scenes"][0]["provisional"]
        smap = result["scenes"][0]["smap"]
        assert smap["date"] == DAY.isoformat()
        assert smap["value"] is not None
        assert smap["provenance"]["resolution_m"] == 9000
        query = next(q for q in archive.queries if q.product == "SPL4SMGP")
        assert query.period is not None
        assert query.period.start == query.period.end == DAY
    if route.endswith("grace"):
        assert result["trend_cm_per_year"] == pytest.approx(4)
        assert result["series"][17]["anomaly_cm"] is None
        assert result["provenance"]["resolution_m"] == 300000
    if route.endswith("gedi"):
        assert len(result["features"]) == 3
        assert result["on_field_count"] == 2
        assert result["height_mean_m"] == 10
        assert result["cover_mean_fraction"] == 0.6
        assert all(len(f["properties"]["products"]) == 2 for f in result["features"])
        assert "cannot identify tree rows" in result["tree_structure_hint"]


@pytest.mark.parametrize(
    "case",
    [(route, params, model, mode) for route, params, model in ROUTES for mode in ("empty", "fail")],
)
def test_explicit_empty_and_safe_upstream_failure(
    client: TestClient, tmp_path: Path, case: tuple[str, dict[str, Any], type[Model], str]
) -> None:
    route, params, model, mode = case
    archive = install(client, tmp_path, **{mode: True})
    response = client.get(route, params=params)
    assert response.status_code == 200
    assert response.json()["status"] == "empty"
    assert "private-upstream" not in response.text
    assert response.json()["coverage_note"]
    Draft202012Validator(model.model_json_schema()).validate(response.json())
    # Empty and failed requests are retryable immediately rather than cached all day.
    before = len(archive.queries)
    client.get(route, params=params)
    assert len(archive.queries) > before


def test_pre_mission_dates_assets_and_bad_queries(client: TestClient, tmp_path: Path) -> None:
    archive = install(client, tmp_path)
    response = client.get(
        "/v1/nisar", params={**SCENE_PARAMS, "from": "2026-01-01", "to": "2026-02-01"}
    )
    assert response.json()["status"] == "empty"
    assert not archive.queries
    assert client.get("/v1/context/assets/" + "a" * 64 + ".png").status_code == 404
    assert client.get("/v1/context/assets/bad.png").status_code == 422
    assert (
        client.get("/v1/nisar", params={**SCENE_PARAMS, "bbox": "nan,35,5,36"}).status_code == 422
    )
    assert client.get("/v1/context/grace", params={"lat": 91, "lon": 5}).status_code == 422
    assert client.get("/v1/context/gedi", params={"bbox": BOX, "extra": "bad"}).status_code == 422
    assert client.get("/v1/nisar", params={**SCENE_PARAMS, "limit": 9}).status_code == 422


def test_pending_work_is_deduplicated_then_becomes_cached(
    client: TestClient, tmp_path: Path
) -> None:
    archive = install(client, tmp_path, delay=0.08)
    assert isinstance(client.app, FastAPI)
    service = client.app.state.context
    service.wait_seconds = 0.001
    response = client.get("/v1/context/grace", params={"lat": 36.12, "lon": 5.33})
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
    assert response.headers["Retry-After"] == "5"
    assert client.get("/v1/context/grace", params={"lat": 36.12, "lon": 5.33}).status_code == 202
    assert len(archive.queries) == 1
    # Complete the task inside the app loop, not by sleeping or calling the network.
    assert client.portal is not None
    client.portal.call(service.close)
    assert client.get("/v1/context/grace", params={"lat": 36.12, "lon": 5.33}).status_code == 200
    assert len(archive.queries) == 1


def test_missing_credentials_are_empty_not_errors(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    for name in ("EARTHDATA_TOKEN", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    for route, params, _ in ROUTES:
        response = client.get(route, params=params)
        assert response.status_code == 200
        assert response.json()["status"] == "empty"


@pytest.mark.parametrize(("route", "params", "model"), ROUTES)
def test_every_context_endpoint_exposes_pending_and_openapi_examples(
    client: TestClient,
    tmp_path: Path,
    route: str,
    params: dict[str, Any],
    model: type[SceneResponse | GraceResponse | GediResponse],
) -> None:
    install(client, tmp_path, delay=0.02)
    assert isinstance(client.app, FastAPI)
    service = client.app.state.context
    service.wait_seconds = 0.001
    response = client.get(route, params=params, headers={"Origin": "http://allowed.test"})
    assert response.headers["access-control-expose-headers"] == "Retry-After"
    assert response.status_code == 202
    Draft202012Validator(model.model_json_schema()).validate(response.json())
    document = client.get("/openapi.json").json()
    operation = document["paths"][route]["get"]
    assert "202" in operation["responses"]
    schema = model.model_json_schema()
    assert schema["examples"]
    for example in schema["examples"]:
        Draft202012Validator(schema).validate(example)
    assert client.portal is not None
    client.portal.call(service.close)
