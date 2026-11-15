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
    # Model/variable pairs the archive does not publish (e.g. CESM2 has no tasmax/tasmin).
    gaps: list[str] = []


def cell_center(lat: float, lon: float) -> tuple[float, float]:
    def snap(value: float) -> float:
        return round(math.floor(value / CELL_DEG) * CELL_DEG + CELL_DEG / 2, 3)

    return snap(lat), snap(lon)


# Where `pipelines/projection_baselines.py` output lives in the shared dataset store.
STORE_SET = Path("derived") / "nex-gddp-cmip6" / "v1"


class BaselineStore:
    """Records in the local data directory first, then in the shared dataset store (if mounted)."""

    def __init__(self, data_dir: Path, store_dir: Path | None = None) -> None:
        self._roots = [data_dir / "baselines" / "projection"]
        if store_dir is not None:
            self._roots.append(store_dir / STORE_SET)

    def load(self, cell_lat: float, cell_lon: float) -> BaselineRecord | None:
        name = f"{cell_lat:.3f}_{cell_lon:.3f}.json"
        for root in self._roots:
            path = root / name
            try:
                return BaselineRecord.model_validate(json.loads(path.read_text()))
            except FileNotFoundError:
                continue
            except ValueError as exc:
                raise UpstreamError(SOURCE, f"baseline record {path.name} is invalid") from exc
        return None
