from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from itza_science.api.ml import get_model
from tests.ml_support import fixture_model, payload

pytestmark = pytest.mark.integration


def test_stress_prediction_with_shap(client: TestClient, tmp_path: Path) -> None:
    assert isinstance(client.app, FastAPI)
    model = fixture_model(tmp_path)
    client.app.dependency_overrides[get_model] = lambda: model
    try:
        response = client.post("/v1/ml/stress", json=payload().model_dump(mode="json"))
    finally:
        client.app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["model_version"] == "fixture-16"
    assert body["prediction"] == pytest.approx(
        body["expected_value"] + sum(driver["shap_value"] for driver in body["drivers"])
    )
    assert body["input_provenance"][0]["source"] == "synthetic fixture"


@pytest.mark.parametrize(
    "case", ["missing", "negative", "extra", "nonfinite", "provenance", "balance"]
)
def test_invalid_features_return_422(client: TestClient, tmp_path: Path, case: str) -> None:
    assert isinstance(client.app, FastAPI)
    model = fixture_model(tmp_path)
    client.app.dependency_overrides[get_model] = lambda: model
    body = payload().model_dump(mode="json")
    if case == "missing":
        del body["features"]["initial"]
    elif case == "negative":
        body["features"]["initial"]["rain_mm"] = -1
    elif case == "balance":
        body["features"]["initial"]["balance_mm"] = 999
    elif case == "extra":
        body["features"]["unknown"] = 1
    elif case == "nonfinite":
        body["features"]["initial"]["et0_mm"] = "NaN"
    else:
        body["provenance"] = []
    try:
        assert client.post("/v1/ml/stress", json=body).status_code == 422
    finally:
        client.app.dependency_overrides.clear()


def test_unavailable_model_returns_503(client: TestClient) -> None:
    response = client.post("/v1/ml/stress", json=payload().model_dump(mode="json"))
    assert response.status_code == 503
    assert response.json()["detail"] == "Trained stress model unavailable"
