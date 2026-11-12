"""Builds fixtures/projection/setif-2050.json: a synthetic /v1/projection response.

    cd services/science-api && uv run python ../../fixtures/projection/generate.py

The numbers are invented (plausible for the high plains) and the file is built with the service's
own response model, so it always matches the real payload shape. Synthetic, not real projections.
"""

import json
from pathlib import Path

from itza_science.api.projection import ProjectionResponse, Provenance, VariableFactors
from itza_science.core.errors import Gap

MODELS = ["cesm2", "ec_earth3", "gfdl_esm4", "giss_e2_1_g", "ipsl_cm6a_lr", "mpi_esm1_2_lr"]
# Per SSP: central change and half-width of the model spread.
SSPS = {
    "ssp126": {"dt": 1.2, "dtw": 0.4, "rain": 0.97, "rainw": 0.06, "rh": -1.0, "rhw": 1.0},
    "ssp245": {"dt": 1.8, "dtw": 0.5, "rain": 0.94, "rainw": 0.07, "rh": -2.0, "rhw": 1.5},
    "ssp370": {"dt": 2.4, "dtw": 0.7, "rain": 0.90, "rainw": 0.09, "rh": -3.0, "rhw": 2.0},
}
WARMING_SHAPE = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8]
RAIN_SHAPE = [1.0, 1.0, 1.05, 1.1, 1.0, 0.9, 0.85, 0.85, 0.95, 1.0, 1.0, 1.0]


def additive(center: float, width: float) -> VariableFactors:
    return VariableFactors(
        kind="additive",
        unit="°C",
        models=6,
        median=[round(center * s, 3) for s in WARMING_SHAPE],
        min=[round((center - width) * s, 3) for s in WARMING_SHAPE],
        max=[round((center + width) * s, 3) for s in WARMING_SHAPE],
    )


def build() -> ProjectionResponse:
    scenarios: dict[str, dict[str, VariableFactors]] = {}
    for ssp, p in SSPS.items():
        scenarios[ssp] = {
            "tmax": additive(p["dt"], p["dtw"]),
            "tmin": additive(p["dt"] - 0.2, p["dtw"]),
            "tmean": additive(p["dt"] - 0.1, p["dtw"]),
            "precip": VariableFactors(
                kind="multiplicative",
                unit="ratio",
                models=6,
                median=[round(1 - (1 - p["rain"]) * m, 3) for m in RAIN_SHAPE],
                min=[round(1 - (1 - p["rain"] + p["rainw"]) * m, 3) for m in RAIN_SHAPE],
                max=[round(1 - (1 - p["rain"] - p["rainw"]) * m, 3) for m in RAIN_SHAPE],
            ),
            "rh": VariableFactors(
                kind="additive",
                unit="percentage points",
                models=6,
                median=[p["rh"]] * 12,
                min=[p["rh"] - p["rhw"]] * 12,
                max=[p["rh"] + p["rhw"]] * 12,
            ),
        }
    return ProjectionResponse(
        lat=36.19,
        lon=5.41,
        cell_lat=36.125,
        cell_lon=5.375,
        scenarios=scenarios,
        provenance=Provenance(
            source="NASA POWER Projection API (NEX-GDDP-CMIP6)",
            source_version="v2.6.4-beta",
            path="power",
            resolution_deg=0.25,
            baseline_period="1995-2014",
            future_period="2041-2060",
            baseline_table_version="synthetic-fixture",
            models=MODELS,
        ),
        gaps=[Gap(var="ssp370.wind", reason="no model data", severity="warning")],
    )


if __name__ == "__main__":
    target = Path(__file__).with_name("setif-2050.json")
    target.write_text(json.dumps(build().model_dump(mode="json"), indent=2) + "\n")
    print(f"wrote {target}")
