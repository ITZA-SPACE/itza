"""Offline feature construction and deterministic cropland sampling."""

import itertools
from datetime import date, timedelta
from random import Random
from typing import Literal

import numpy as np
from itza_science.api.ml import Model, SeasonFeatures, StageFeatures
from pydantic import Field, model_validator


class Day(Model):
    date: date
    stage: Literal["initial", "development", "mid", "late"]
    rain_mm: float = Field(ge=0, le=1000)
    et0_mm: float = Field(ge=0, le=50)
    tmin_c: float = Field(ge=-100, le=70)
    tmax_c: float = Field(ge=-100, le=70)

    @model_validator(mode="after")
    def temperatures(self) -> "Day":
        if self.tmin_c > self.tmax_c:
            raise ValueError("minimum temperature exceeds maximum")
        return self


def build_features(days: list[Day], **state: float | None) -> SeasonFeatures:
    """Dry = <1 mm/day; frost <0 C, heat >35 C; ET0 is reference ET, not crop ET."""
    if not days or any(b.date - a.date != timedelta(days=1) for a, b in itertools.pairwise(days)):
        raise ValueError("weather must be daily, ordered and complete")
    stages = ("initial", "development", "mid", "late")
    order = [stages.index(day.stage) for day in days]
    if order != sorted(order):
        raise ValueError("crop stages must be consecutive and ordered")
    result: dict[str, StageFeatures] = {}
    for stage in stages:
        part = [day for day in days if day.stage == stage]
        if not part:
            raise ValueError(f"missing stage: {stage}")
        longest = run = 0
        for day in part:
            run = run + 1 if day.rain_mm < 1 else 0
            longest = max(longest, run)
        rain, et0 = sum(d.rain_mm for d in part), sum(d.et0_mm for d in part)
        result[stage] = StageFeatures(
            rain_mm=rain,
            et0_mm=et0,
            balance_mm=rain - et0,
            dry_spell_days=longest,
            frost_days=sum(d.tmin_c < 0 for d in part),
            heat_days=sum(d.tmax_c > 35 for d in part),
        )
    return SeasonFeatures.model_validate({**result, **state})


class PixelSeason(Model):
    region: Literal["dz-high-plains", "us-central-great-plains"]
    block: str = Field(min_length=1)
    pixel: str = Field(min_length=1)
    year: int = Field(ge=2001, le=2025)
    cropland: bool
    peak_ndvi: float = Field(ge=-1, le=1)
    features: SeasonFeatures


def sample(rows: list[PixelSeason], seed: int, per_region: int) -> list[PixelSeason]:
    """Sample whole pixel histories, so prior state and target climatology remain available."""
    if per_region < 1:
        raise ValueError("per_region must be positive")
    keys = [(row.pixel, row.year) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate pixel-year")
    random = Random(seed)
    selected: list[PixelSeason] = []
    for region in ("dz-high-plains", "us-central-great-plains"):
        pixels = sorted({r.pixel for r in rows if r.region == region and r.cropland})
        if not pixels:
            raise ValueError(f"no cropland seasons in {region}")
        chosen = set(random.sample(pixels, min(per_region, len(pixels))))
        selected.extend(r for r in rows if r.region == region and r.pixel in chosen and r.cropland)
    return sorted(selected, key=lambda row: (row.region, row.pixel, row.year))


def targets(rows: list[PixelSeason]) -> list[float]:
    """Retrospective target climatology: full observed 2001–2025 history, never a feature."""
    result = []
    for row in rows:
        values = [r.peak_ndvi for r in rows if r.pixel == row.pixel]
        if len(values) < 5 or np.std(values) < 1e-6:
            raise ValueError(f"insufficient nonconstant NDVI history: {row.pixel}")
        result.append(float((row.peak_ndvi - np.mean(values)) / np.std(values)))
    return result


def splits(
    rows: list[PixelSeason], kind: Literal["spatial", "temporal"]
) -> list[tuple[str, list[int], list[int]]]:
    groups = [row.block if kind == "spatial" else str(row.year) for row in rows]
    if len(set(groups)) < 2:
        raise ValueError(f"{kind} CV requires at least two groups")
    return [
        (
            group,
            [i for i, value in enumerate(groups) if value != group],
            [i for i, value in enumerate(groups) if value == group],
        )
        for group in sorted(set(groups))
    ]
