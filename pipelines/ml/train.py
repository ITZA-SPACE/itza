"""Seeded CPU LightGBM regression with grouped out-of-fold metrics and native TreeSHAP."""

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from itza_science.api.ml import FEATURES, ModelMetadata, Source
from numpy.typing import NDArray

from data import PixelSeason, sample, splits, targets

FloatArray = NDArray[np.float64]
LIMITATIONS = [
    "Retrospective statistical opinion, not measured yield or an agronomic prescription.",
    "Irrigation, crop choice and management confound weather/NDVI relationships.",
    "MODIS pixels mix crops, fallow, boundaries and other land cover; cropland mask is 500 m.",
    "POWER weather is coarse and shared by many pixels; pixel counts are not independent samples.",
    "January–June fixed winter-cereal windows are calendar proxies, not observed crop stages.",
    "Hargreaves reference ET0 is temperature-based and less reliable than full FAO-56 Penman–Monteith.",
    "Targets use a fixed retrospective per-pixel climatology, including held-out years; CV is not a prospective forecasting estimate.",
    "Spatial CV holds out entire sampled areas; it does not establish transfer to an unsampled region.",
]


def fit(x: FloatArray, y: FloatArray, seed: int) -> lgb.Booster:
    return lgb.train(
        {
            "objective": "regression",
            "metric": "rmse",
            "verbosity": -1,
            "seed": seed,
            "deterministic": True,
            "force_col_wise": True,
            "num_threads": 1,
            "num_leaves": 7,
            "min_data_in_leaf": 20,
            "learning_rate": 0.05,
            "lambda_l2": 5.0,
        },
        lgb.Dataset(x, label=y, feature_name=list(FEATURES)),
        num_boost_round=80,
    )


def scores(actual: FloatArray, predicted: FloatArray) -> dict[str, float]:
    residual = actual - predicted
    return {
        "rmse": float(np.sqrt(np.mean(residual**2))),
        "mae": float(np.mean(np.abs(residual))),
        "r2": float(1 - np.sum(residual**2) / np.sum((actual - np.mean(actual)) ** 2))
        if np.var(actual) > 0
        else 0.0,
    }


def train(
    rows: list[PixelSeason],
    directory: Path,
    *,
    seed: int,
    per_region: int,
    provenance: list[Source],
    dataset_hash: str,
) -> dict[str, Any]:
    raw_rows = len(rows)
    rows = sample(rows, seed, per_region)
    x = np.asarray([row.features.vector() for row in rows], dtype=float)
    y = np.asarray(targets(rows), dtype=float)
    report: dict[str, Any] = {
        "seed": seed,
        "dataset_sha256": dataset_hash,
        "rows": len(rows),
        "raw_rows": raw_rows,
        "block_counts": dict(Counter(row.block for row in rows)),
        "pixels": len({r.pixel for r in rows}),
        "years": sorted({r.year for r in rows}),
        "regions": sorted({r.region for r in rows}),
        "cv": {},
    }
    for kind in ("spatial", "temporal"):
        prediction = np.zeros(len(rows))
        baseline = np.zeros(len(rows))
        folds = []
        for group, training, held in splits(rows, kind):
            booster = fit(x[training], y[training], seed)
            prediction[held] = booster.predict(x[held], num_threads=1)
            baseline[held] = np.mean(y[training])
            folds.append(
                {
                    "group": group,
                    "train_rows": len(training),
                    "test_rows": len(held),
                    **scores(y[held], prediction[held]),
                }
            )
        report["cv"][kind] = {
            **scores(y, prediction),
            "baseline": scores(y, baseline),
            "folds": folds,
            "by_region": {
                region: scores(y[index], prediction[index])
                for region in report["regions"]
                for index in [[i for i, row in enumerate(rows) if row.region == region]]
            },
        }
    booster = fit(x, y, seed)
    contributions = np.asarray(booster.predict(x, pred_contrib=True, num_threads=1))
    report["mean_absolute_shap"] = dict(
        zip(FEATURES, np.mean(np.abs(contributions[:, :-1]), axis=0).tolist(), strict=True)
    )
    report["missing_features"] = {
        name: int(np.isnan(x[:, index]).sum())
        for index, name in enumerate(FEATURES)
        if np.isnan(x[:, index]).any()
    }
    missing = [name for i, name in enumerate(FEATURES) if np.isnan(x[:, i]).all()]
    signature = json.dumps({"report": report, "model": booster.model_to_string()}, sort_keys=True)
    version = "stress-v1-" + hashlib.sha256(signature.encode()).hexdigest()[:12]
    limitations = [*LIMITATIONS, f"Features without observations in this training run: {missing}"]
    if min(report["cv"][kind]["r2"] for kind in ("spatial", "temporal")) < 0.2:
        limitations.append("Low explained variance in holdouts; experimental second opinion only.")
    for region, values in report["cv"]["spatial"]["by_region"].items():
        if values["r2"] < 0:
            limitations.append(f"Spatial holdout in {region} does not beat a mean prediction.")
    metadata = ModelMetadata(
        model_version=version,
        status="trained",
        features=list(FEATURES),
        provenance=provenance,
        limitations=limitations,
    )
    directory.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(directory / "model.txt"))
    (directory / "metadata.json").write_text(metadata.model_dump_json(indent=2) + "\n")
    (directory / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=16)
    parser.add_argument("--pixels-per-region", type=int, default=300)
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    if args.dataset.suffix == ".gz":
        raw = gzip.decompress(raw)
    rows = [PixelSeason.model_validate_json(line) for line in raw.splitlines() if line.strip()]
    provenance = [Source.model_validate(item) for item in json.loads(args.provenance.read_text())]
    train(
        rows,
        args.output,
        seed=args.seed,
        per_region=args.pixels_per_region,
        provenance=provenance,
        dataset_hash=hashlib.sha256(raw).hexdigest(),
    )


if __name__ == "__main__":
    main()
