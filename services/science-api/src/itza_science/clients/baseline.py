"""Precomputed NEX-GDDP-CMIP6 monthly climatologies per 0.25 degree cell.

Reading the archive per request is not feasible (each daily file is ~245 MB, ~840 files
per location for the baseline), so a pipeline writes one JSON record per cell and this
store serves it.
"""

import json
import math
from pathlib import Path

from pydantic import BaseModel

from itza_science.core.errors import UpstreamError

CELL_DEG = 0.25
BASELINE_PERIOD = "1995-2014"
FUTURE_PERIOD = "2041-2060"
SOURCE = "nex_gddp_baseline"


class ModelClimatology(BaseModel):
    baseline: dict[str, list[float]]
    future: dict[str, dict[str, list[float]]] = {}


class BaselineRecord(BaseModel):
    version: str
    cell_lat: float
    cell_lon: float
    models: dict[str, ModelClimatology]


def cell_center(lat: float, lon: float) -> tuple[float, float]:
    def snap(value: float) -> float:
        return round(math.floor(value / CELL_DEG) * CELL_DEG + CELL_DEG / 2, 3)

    return snap(lat), snap(lon)


class BaselineStore:
    def __init__(self, data_dir: Path) -> None:
        self._root = data_dir / "baselines" / "projection"

    def load(self, cell_lat: float, cell_lon: float) -> BaselineRecord | None:
        path = self._root / f"{cell_lat:.3f}_{cell_lon:.3f}.json"
        try:
            return BaselineRecord.model_validate(json.loads(path.read_text()))
        except FileNotFoundError:
            return None
        except ValueError as exc:
            raise UpstreamError(SOURCE, f"baseline record {path.name} is invalid") from exc
