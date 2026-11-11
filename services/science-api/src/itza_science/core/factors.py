"""Delta-change factor math: future monthly climatology vs the model historical baseline."""

from dataclasses import dataclass
from statistics import median
from typing import Literal

Kind = Literal["additive", "multiplicative"]

RATIO_MIN = 0.2
RATIO_MAX = 3.0
BASELINE_EPSILON = 0.01


@dataclass(frozen=True)
class VariableSpec:
    power_name: str
    kind: Kind
    unit: str


VARIABLES: dict[str, VariableSpec] = {
    "tmax": VariableSpec("T2M_MAX", "additive", "°C"),
    "tmin": VariableSpec("T2M_MIN", "additive", "°C"),
    "tmean": VariableSpec("T2M", "additive", "°C"),
    "precip": VariableSpec("PRECTOTCORR", "multiplicative", "ratio"),
    "rh": VariableSpec("RH2M", "additive", "percentage points"),
    "wind": VariableSpec("WS10M", "multiplicative", "ratio"),
    "srad": VariableSpec("ALLSKY_SFC_SW_DWN", "multiplicative", "ratio"),
}
CORE_VARIABLES = ("tmax", "tmin", "tmean", "precip")


def change_factor(kind: Kind, baseline: float, future: float) -> float:
    if kind == "additive":
        return future - baseline
    if baseline < BASELINE_EPSILON:
        return 1.0
    return min(max(future / baseline, RATIO_MIN), RATIO_MAX)


def monthly_factors(kind: Kind, baseline: list[float], future: list[float]) -> list[float]:
    return [change_factor(kind, b, f) for b, f in zip(baseline, future, strict=True)]


@dataclass(frozen=True)
class Spread:
    median: list[float]
    low: list[float]
    high: list[float]


def spread(per_model: list[list[float]]) -> Spread:
    months = list(zip(*per_model, strict=True))
    return Spread(
        median=[median(m) for m in months],
        low=[min(m) for m in months],
        high=[max(m) for m in months],
    )
