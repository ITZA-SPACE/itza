import json
from datetime import date
from hashlib import sha256
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr
from shapely.geometry import box

from itza_science.adapters.gldas import GLDAS, LAYERS, NLDAS
from itza_science.adapters.granules import Granule

FIELD = box(-103.17, 40.16, -103.16, 40.17)
DAY = date(2014, 6, 1)
LDAS_FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "ldas"


def native_fixture(path: Path, source: str) -> Path:
    hours = 3 if source == GLDAS else 1
    times = np.arange(
        np.datetime64("2014-06-01T00"), np.datetime64("2014-06-02T01"), np.timedelta64(hours, "h")
    )
    shape = (len(times), 2, 2)
    dims = ("time", "lat", "lon")
    variables: dict[str, Any] = {}
    if source == GLDAS:
        for name, value in zip(LAYERS, [10, 60, 180], strict=True):
            variables[name] = (dims, np.full(shape, value, dtype=float), {"units": "kg m-2"})
        variables["Evap_tavg"] = (dims, np.full(shape, 0.00002), {"units": "kg m-2 s-1"})
    else:
        variables["SoilM_0_100cm"] = (dims, np.full(shape, 250.0), {"units": "kg m-2"})
        variables["Evap"] = (dims, np.full(shape, 0.072), {"units": "kg m-2"})
    variables["time_bnds"] = (
        ("time", "bnds"),
        np.column_stack([times - np.timedelta64(hours, "h"), times]),
    )
    with xr.Dataset(
        variables,
        coords={
            "time": times,
            "lat": [40.125, 40.375] if source == GLDAS else [40.0625, 40.1875],
            "lon": [-103.375, -103.125] if source == GLDAS else [-103.3125, -103.1875],
        },
    ) as dataset:
        # First ET interval belongs to yesterday, so its value must never enter today's total.
        dataset["Evap_tavg" if source == GLDAS else "Evap"][0] = 1000
        dataset.to_netcdf(path, engine="h5netcdf")
    return path


class RecordedLdasReader:
    """Replay only the recorded real day; all other days are explicitly unavailable."""

    def credentials_available(self) -> bool:
        return True

    async def search_day(
        self, short_name: str, version: str, bbox: tuple[float, float, float, float], day: date
    ) -> list[Granule]:
        source = NLDAS if short_name.startswith("NLDAS") else GLDAS
        folder = LDAS_FIXTURES / source
        manifest = json.loads((folder / "manifest.json").read_text())
        if str(day) != manifest["day"] or tuple(manifest["bbox"]) != bbox:
            return []
        assert version == manifest["version"]
        files = []
        for name, digest in manifest["files"].items():
            path = folder / name
            assert sha256(path.read_bytes()).hexdigest() == digest
            files.append(Granule(path, day))
        return files
