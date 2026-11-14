"""Small, deterministic regression fixture; explicitly not an agronomic model."""

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np

from itza_science.api.ml import (
    FEATURES,
    ModelMetadata,
    SeasonFeatures,
    Source,
    StressModel,
    StressRequest,
)


def payload() -> StressRequest:
    stage = {
        "rain_mm": 20.0,
        "et0_mm": 50.0,
        "balance_mm": -30.0,
        "dry_spell_days": 10,
        "frost_days": 0,
        "heat_days": 1,
    }
    return StressRequest(
        features=SeasonFeatures.model_validate(
            dict.fromkeys(("initial", "development", "mid", "late"), stage)
        ),
        provenance=[Source(source="synthetic fixture", resolution="none", period="test only")],
    )


def fixture_model(directory: Path, *, status: str = "fixture") -> StressModel:
    directory.mkdir(parents=True, exist_ok=True)
    random = np.random.default_rng(16)
    x = random.uniform(0, 100, (40, len(FEATURES)))
    model = lgb.train(
        {
            "objective": "regression",
            "verbosity": -1,
            "num_threads": 1,
            "min_data_in_leaf": 2,
            "num_leaves": 4,
            "seed": 16,
            "deterministic": True,
            "force_col_wise": True,
        },
        lgb.Dataset(x, label=x[:, 0] / 50 - x[:, 1] / 25, feature_name=list(FEATURES)),
        num_boost_round=5,
    )
    model.save_model(str(directory / "model.txt"))
    metadata = ModelMetadata.model_validate(
        {
            "model_version": "fixture-16",
            "status": status,
            "features": list(FEATURES),
            "provenance": [
                {"source": "synthetic fixture", "resolution": "none", "period": "test only"}
            ],
            "limitations": ["Not an agronomic model"],
        }
    )
    (directory / "metadata.json").write_text(json.dumps(metadata.model_dump()))
    return StressModel(directory)
