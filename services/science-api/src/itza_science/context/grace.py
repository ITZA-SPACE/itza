"""GRACE mascon point extraction and a gap-preserving ordinary least-squares trend."""

from datetime import date
from pathlib import Path

import numpy as np
import xarray as xr

from itza_science.context.models import MonthlyValue


def trend(series: list[MonthlyValue]) -> float | None:
    valid = sorted((p.date, p.anomaly_cm) for p in series if p.anomaly_cm is not None)
    if len(valid) < 24 or (valid[-1][0] - valid[0][0]).days < 365:
        return None
    x = np.asarray([(day - valid[0][0]).days / 365.2425 for day, _ in valid])
    y = np.asarray([value for _, value in valid], dtype=float)
    x -= x.mean()
    return float(np.dot(x, y - y.mean()) / np.dot(x, x))


def read_grace(path: Path, lat: float, lon: float) -> list[MonthlyValue]:
    with xr.open_dataset(path, engine="h5netcdf") as dataset:
        longitude = lon % 360 if float(dataset.lon.max()) > 180 else lon
        cell = dataset.sel(lat=lat, lon=longitude, method="nearest")
        if "land_mask" in cell and float(cell.land_mask) != 1:
            return []
        variable = cell["lwe_thickness"]
        unit = str(variable.attrs.get("units", "")).lower()
        if unit not in ("cm", "m", "centimeters", "meters"):
            raise ValueError("unsupported GRACE thickness unit")
        multiplier = 100 if unit in ("m", "meters") else 1
        gain = float(cell["scale_factor"]) if "scale_factor" in cell else 1.0
        if not np.isfinite(gain) or gain <= 0:
            return []
        values = np.asarray(variable.values, dtype=float).ravel() * multiplier * gain
        dates = [date.fromisoformat(str(v)[:10]).replace(day=1) for v in dataset.time.values]
        monthly = {
            day: float(value) if np.isfinite(value) else None
            for day, value in zip(dates, values, strict=True)
        }
        if not monthly:
            return []
        if len(monthly) != len(dates):
            raise ValueError("GRACE record has duplicate months")
        output = []
        current, last = min(monthly), max(monthly)
        while current <= last:
            output.append(MonthlyValue(date=current, anomaly_cm=monthly.get(current)))
            current = (
                date(current.year + 1, 1, 1)
                if current.month == 12
                else date(current.year, current.month + 1, 1)
            )
        return output
