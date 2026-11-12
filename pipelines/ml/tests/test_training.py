from datetime import date, timedelta
from pathlib import Path
from typing import Literal

import numpy as np
import pytest
from itza_science.api.ml import Source, StressModel, StressRequest

from data import Day, PixelSeason, build_features, sample, splits, targets
from train import train

pytestmark = pytest.mark.unit


def days() -> list[Day]:
    return [
        Day(
            date=date(2001, 1, 1) + timedelta(days=i),
            stage=("initial", "development", "mid", "late")[i // 4],
            rain_mm=10 if i % 4 == 2 else 0,
            et0_mm=2,
            tmin_c=-1,
            tmax_c=36,
        )
        for i in range(16)
    ]


def rows() -> list[PixelSeason]:
    features = build_features(days())
    return [
        PixelSeason(
            region=region,
            block=f"{region}-{block}",
            pixel=f"{region}-{block}-{pixel}",
            year=year,
            cropland=True,
            peak_ndvi=0.2 + 0.05 * (year - 2001) + 0.01 * pixel,
            features=features,
        )
        for region in ("dz-high-plains", "us-central-great-plains")
        for block in range(2)
        for pixel in range(2)
        for year in range(2001, 2007)
    ]


def test_stage_aggregation() -> None:
    features = build_features(days())
    for stage in (features.initial, features.development, features.mid, features.late):
        assert stage.rain_mm == 10
        assert stage.et0_mm == 8
        assert stage.balance_mm == 2
        assert stage.dry_spell_days == 2
        assert stage.frost_days == stage.heat_days == 4


@pytest.mark.parametrize("case", ["empty", "gap", "duplicate", "missing", "order"])
def test_incomplete_or_unordered_weather_rejected(case: str) -> None:
    values = days()
    if case == "empty":
        values = []
    elif case == "gap":
        del values[2]
    elif case == "duplicate":
        values[1] = values[0]
    elif case == "missing":
        values = values[:12]
    else:
        values[0] = values[0].model_copy(update={"stage": "late"})
    with pytest.raises(ValueError):
        build_features(values)


@pytest.mark.parametrize("kind", ["spatial", "temporal"])
def test_group_splits_are_exhaustive_and_disjoint(kind: Literal["spatial", "temporal"]) -> None:
    dataset = rows()
    seen = []
    for _, training, held in splits(dataset, kind):
        assert set(training).isdisjoint(held)
        assert set(training) | set(held) == set(range(len(dataset)))

        def key(row: PixelSeason) -> str | int:
            return row.block if kind == "spatial" else row.year

        assert {key(dataset[i]) for i in training}.isdisjoint(key(dataset[i]) for i in held)
        seen.extend(held)
    assert sorted(seen) == list(range(len(dataset)))


def test_seeded_sampling_ignores_input_order_and_non_cropland() -> None:
    dataset = rows()
    dataset[0] = dataset[0].model_copy(update={"cropland": False})
    assert sample(dataset, 16, 2) == sample(list(reversed(dataset)), 16, 2)
    assert all(row.cropland for row in sample(dataset, 16, 2))
    with pytest.raises(ValueError, match="duplicate"):
        sample([*dataset, dataset[0]], 16, 2)
    with pytest.raises(ValueError):
        sample([], 16, 2)


def test_target_standardized_per_pixel() -> None:
    dataset = rows()
    y = targets(dataset)
    for pixel in {row.pixel for row in dataset}:
        values = [value for row, value in zip(dataset, y, strict=True) if row.pixel == pixel]
        assert np.mean(values) == pytest.approx(0, abs=1e-10)
        assert np.std(values) == pytest.approx(1)
    with pytest.raises(ValueError, match="insufficient"):
        targets(dataset[:1])


def test_end_to_end_training_is_reproducible(tmp_path: Path) -> None:
    provenance = [Source(source="synthetic", resolution="none", period="2001–2006")]
    for directory in (tmp_path / "a", tmp_path / "b"):
        report = train(
            rows(), directory, seed=16, per_region=4, provenance=provenance, dataset_hash="fixture"
        )
        assert len(report["cv"]["spatial"]["folds"]) == 4
        assert len(report["cv"]["temporal"]["folds"]) == 6
        assert np.isfinite(report["cv"]["temporal"]["rmse"])
        result = StressModel(directory).predict(
            StressRequest(features=rows()[0].features, provenance=provenance)
        )
        assert np.isfinite(result.prediction)
    for name in ("model.txt", "metadata.json", "metrics.json"):
        assert (tmp_path / "a" / name).read_bytes() == (tmp_path / "b" / name).read_bytes()
