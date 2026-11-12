import json
from pathlib import Path

import numpy as np
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from itza_science.api.ml import FEATURES, StressModel, get_model, load_model
from itza_science.main import create_app
from tests.ml_support import fixture_model, payload

pytestmark = pytest.mark.unit


def test_shap_additivity_and_feature_order(tmp_path: Path) -> None:
    model = fixture_model(tmp_path)
    request = payload()
    result = model.predict(request)
    expected = model.booster.predict(np.array([request.features.vector()]), num_threads=1)[0]
    assert result.prediction == pytest.approx(expected)
    assert result.prediction == pytest.approx(
        result.expected_value + sum(driver.shap_value for driver in result.drivers)
    )
    assert [abs(d.shap_value) for d in result.drivers] == sorted(
        [abs(d.shap_value) for d in result.drivers], reverse=True
    )
    assert set(result.gaps) == set(FEATURES[-4:])
    assert all(d.value is None for d in result.drivers if d.feature in result.gaps)
    assert load_model(tmp_path) is load_model(tmp_path)


def test_reject_feature_order_mismatch(tmp_path: Path) -> None:
    fixture_model(tmp_path)
    path = tmp_path / "metadata.json"
    metadata = json.loads(path.read_text())
    metadata["features"].reverse()
    path.write_text(json.dumps(metadata))
    with pytest.raises(ValueError, match="feature order"):
        StressModel(tmp_path)


@pytest.mark.parametrize("available", [True, False])
def test_live_loader_requires_trained_artifact(tmp_path: Path, available: bool) -> None:
    if available:
        fixture_model(tmp_path)
    app = create_app()
    app.state.ml_directory = tmp_path
    with pytest.raises(HTTPException) as error:
        get_model(Request({"type": "http", "app": app}))
    assert error.value.status_code == 503


def test_live_loader_accepts_trained_artifact(tmp_path: Path) -> None:
    fixture_model(tmp_path, status="trained")
    app = create_app()
    app.state.ml_directory = tmp_path
    assert get_model(Request({"type": "http", "app": app})).metadata.status == "trained"


def test_reject_classification_model(tmp_path: Path) -> None:
    fixture_model(tmp_path)
    path = tmp_path / "model.txt"
    path.write_text(
        path.read_text().replace("objective=regression", "objective=binary sigmoid:1", 1)
    )
    with pytest.raises(ValueError, match="scalar regressor"):
        StressModel(tmp_path)
