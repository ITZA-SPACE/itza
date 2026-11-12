"""Read native IMERG NetCDF and SMAP L4 HDF5 grids with their actual coordinate systems."""

from pathlib import Path

import numpy as np
import numpy.typing as npt
import xarray as xr
from pyproj import Transformer

from itza_science.geo.clip import Grid


def load_daily_mean_grid(
    path: Path, var_name: str, lat_name: str = "lat", lon_name: str = "lon"
) -> tuple[Grid, npt.NDArray[np.floating], npt.NDArray[np.bool_]]:
    """Return north-up values/invalid mask; transpose named dimensions before flattening.

    Native IMERG is (time, lon, lat), not the (time, lat, lon) synthetic fixture.
    SMAP's native variables are in Geophysical_Data on an EPSG:6933 EASE-Grid.
    """
    with xr.open_dataset(path, engine="h5netcdf", phony_dims="access") as root:
        if var_name in root:
            data = root[var_name]
            if "time" in data.dims:
                data = data.mean(dim="time", skipna=True)
            values = np.asarray(data.transpose(lat_name, lon_name).values, dtype=float)
            lats = np.asarray(root[lat_name].values, dtype=float)
            lons = np.asarray(root[lon_name].values, dtype=float)
            crs = "EPSG:4326"
        else:
            project = Transformer.from_crs(4326, 6933, always_xy=True)
            # Static native geolocation; first row/column suffice to locate the grid.
            lons, _ = project.transform(
                root["cell_lon"].values[0, :], root["cell_lat"].values[0, :]
            )
            _, lats = project.transform(
                root["cell_lon"].values[:, 0], root["cell_lat"].values[:, 0]
            )
            with xr.open_dataset(
                path, group="Geophysical_Data", engine="h5netcdf", phony_dims="access"
            ) as group:
                values = np.asarray(group[var_name].values, dtype=float)
            crs = "EPSG:6933"
    if lats[0] < lats[-1]:
        lats = lats[::-1]
        values = values[::-1, :]
    if lons[0] > lons[-1]:
        lons = lons[::-1]
        values = values[:, ::-1]
    invalid = ~np.isfinite(values)
    if var_name.startswith("sm_"):
        invalid |= (values < 0) | (values > 1)
    elif var_name == "precipitation":
        invalid |= values < 0
    grid = Grid.from_centers(lons, lats, crs=crs)
    return grid, np.where(invalid, 0.0, values), invalid


def time_samples(path: Path) -> int:
    """Synthetic daily files can contain 8 steps; native SMAP files contain one."""
    with xr.open_dataset(path, engine="h5netcdf", phony_dims="access") as ds:
        return ds.sizes.get("time", 1)
