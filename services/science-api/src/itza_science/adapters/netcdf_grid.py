"""Shared helper: load one day's regular lon/lat grid out of a NetCDF granule."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import numpy.typing as npt
import xarray as xr

from itza_science.geo.clip import Grid


def load_daily_mean_grid(
    path: Path, var_name: str, lat_name: str = "lat", lon_name: str = "lon"
) -> tuple[Grid, npt.NDArray[np.floating], npt.NDArray[np.bool_]]:
    """Open a NetCDF granule and return ``(grid, values, invalid)`` for ``var_name``.

    When the variable carries a leading ``time`` dimension (SMAP's 3-hourly
    steps for the day), returns that day's mean, skipping NaNs; a cell with
    no valid step at all is marked invalid.
    """
    with xr.open_dataset(path) as ds:
        data = ds[var_name]
        if "time" in data.dims:
            observed = data.notnull().sum(dim="time")
            mean = data.mean(dim="time", skipna=True)
            invalid = (observed == 0).to_numpy()
            values = mean.fillna(0.0).to_numpy()
        else:
            raw = data.to_numpy().astype(float)
            invalid = ~np.isfinite(raw)
            values = np.where(invalid, 0.0, raw)
        lats = ds[lat_name].to_numpy()
        lons = ds[lon_name].to_numpy()
    if lats[0] < lats[-1]:
        lats = lats[::-1]
        values = values[::-1, :]
        invalid = invalid[::-1, :]
    grid = Grid.from_centers(lons, lats)
    return grid, values, invalid
