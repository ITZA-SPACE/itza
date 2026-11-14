"""Validated, versioned LightGBM stress inference; never fall back to a fixture model."""

from functools import lru_cache
from math import isclose
from pathlib import Path
from typing import Annotated, Literal

import lightgbm as lgb
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

STAGES = ("initial", "development", "mid", "late")
WEATHER = ("rain_mm", "dry_spell_days", "et0_mm", "balance_mm", "frost_days", "heat_days")
FEATURES = (
    *tuple(f"{stage}_{name}" for stage in STAGES for name in WEATHER),
    "smap_rootzone_anomaly",
    "previous_peak_ndvi",
    "soil_awc_mm_m",
    "slope_deg",
)
router = APIRouter(prefix="/v1/ml", tags=["ml"])


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class StageFeatures(Model):
    rain_mm: float = Field(ge=0, le=10000)
    dry_spell_days: int = Field(ge=0, le=366)
    et0_mm: float = Field(ge=0, le=10000)
    balance_mm: float = Field(ge=-10000, le=10000)
    frost_days: int = Field(ge=0, le=366)
    heat_days: int = Field(ge=0, le=366)

    @model_validator(mode="after")
    def balance(self) -> "StageFeatures":
        if not isclose(self.balance_mm, self.rain_mm - self.et0_mm, abs_tol=1e-6):
            raise ValueError("balance_mm must equal rain_mm minus et0_mm")
        return self


class SeasonFeatures(Model):
    initial: StageFeatures
    development: StageFeatures
    mid: StageFeatures
    late: StageFeatures
    smap_rootzone_anomaly: float | None = Field(default=None, ge=-20, le=20)
    previous_peak_ndvi: float | None = Field(default=None, ge=-1, le=1)
    soil_awc_mm_m: float | None = Field(default=None, gt=0, le=1000)
    slope_deg: float | None = Field(default=None, ge=0, le=90)

    def vector(self) -> list[float]:
        values = [
            float(getattr(getattr(self, stage), name)) for stage in STAGES for name in WEATHER
        ]
        return values + [
            float(value) if value is not None else float("nan")
            for name in FEATURES[-4:]
            for value in [getattr(self, name)]
        ]


class Source(Model):
    source: str = Field(min_length=1, max_length=500)
    resolution: str = Field(min_length=1, max_length=200)
    period: str = Field(min_length=1, max_length=100)


class StressRequest(Model):
    features: SeasonFeatures
    provenance: list[Source] = Field(min_length=1, max_length=20)


class ModelMetadata(Model):
    model_version: str = Field(min_length=1)
    status: Literal["trained", "fixture"]
    features: list[str]
    provenance: list[Source] = Field(min_length=1)
    limitations: list[str]


class Driver(Model):
    feature: str
    value: float | None
    shap_value: float


class StressResponse(Model):
    prediction: float
    unit: Literal["NDVI peak anomaly z-score"] = "NDVI peak anomaly z-score"
    expected_value: float
    drivers: list[Driver]
    model: ModelMetadata
    input_provenance: list[Source]
    gaps: list[str]


class StressModel:
    def __init__(self, directory: Path) -> None:
        self.metadata = ModelMetadata.model_validate_json((directory / "metadata.json").read_text())
        self.booster = lgb.Booster(model_file=str(directory / "model.txt"))
        if self.metadata.features != list(FEATURES) or self.booster.feature_name() != list(
            FEATURES
        ):
            raise ValueError("model feature order does not match the stress contract")
        objective = str(self.booster.dump_model().get("objective", ""))
        if self.booster.num_model_per_iteration() != 1 or not objective.startswith("regression"):
            raise ValueError("stress model must be a scalar regressor")

    def predict(self, payload: StressRequest) -> StressResponse:
        values = payload.features.vector()
        contributions = np.asarray(
            self.booster.predict(np.array([values]), pred_contrib=True, num_threads=1), dtype=float
        )[0]
        if contributions.shape != (len(FEATURES) + 1,) or not np.isfinite(contributions).all():
            raise ValueError("invalid model prediction")
        drivers = [
            Driver(feature=name, value=None if np.isnan(value) else value, shap_value=float(shap))
            for name, value, shap in zip(FEATURES, values, contributions[:-1], strict=True)
        ]
        drivers.sort(key=lambda driver: abs(driver.shap_value), reverse=True)
        return StressResponse(
            prediction=float(contributions.sum()),
            expected_value=float(contributions[-1]),
            drivers=drivers,
            model=self.metadata,
            input_provenance=payload.provenance,
            gaps=[name for name, value in zip(FEATURES, values, strict=True) if np.isnan(value)],
        )


@lru_cache(maxsize=2)
def load_model(directory: Path) -> StressModel:
    return StressModel(directory)


def get_model(request: Request) -> StressModel:
    directory: Path = request.app.state.ml_directory
    try:
        model = load_model(directory)
        if model.metadata.status != "trained":
            raise ValueError("fixture models cannot serve live predictions")
        return model
    except (OSError, ValueError, lgb.basic.LightGBMError) as exc:
        raise HTTPException(status_code=503, detail="Trained stress model unavailable") from exc


@router.post("/stress")
def stress(
    payload: StressRequest, model: Annotated[StressModel, Depends(get_model)]
) -> StressResponse:
    return model.predict(payload)
