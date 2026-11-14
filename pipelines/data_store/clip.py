"""Clip global SMAP L4 and IMERG granules to a padded field window (issue #103).

The windows follow the demo pipeline (`pipelines/build_demo.py`): SMAP keeps the surface and root
zone moisture of the native 9 km cells around the box, IMERG keeps the precipitation grid.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

Bbox = tuple[float, float, float, float]

SMAP_PAD = 0.12
IMERG_PAD = 0.15
SMAP_VARIABLES = (
    "cell_lat",
    "cell_lon",
    "Geophysical_Data/sm_surface",
    "Geophysical_Data/sm_rootzone",
)
_SKIP_ATTRS = {"DIMENSION_LIST", "REFERENCE_LIST", "CLASS", "NAME"}


def clip_smap(source: Path, target: Path, bbox: Bbox) -> None:
    import h5py
    import numpy as np

    with h5py.File(source) as src, h5py.File(target, "w") as dst:
        lat = src["cell_lat"][:, 0]
        lon = src["cell_lon"][0, :]
        rows = np.flatnonzero((lat >= bbox[1] - SMAP_PAD) & (lat <= bbox[3] + SMAP_PAD))
        cols = np.flatnonzero((lon >= bbox[0] - SMAP_PAD) & (lon <= bbox[2] + SMAP_PAD))
        if not len(rows) or not len(cols):
            raise ValueError("no native SMAP window")
        window = (
            slice(int(rows.min()), int(rows.max()) + 1),
            slice(int(cols.min()), int(cols.max()) + 1),
        )
        for name in SMAP_VARIABLES:
            item = dst.create_dataset(name, data=src[name][window])
            for key, value in src[name].attrs.items():
                if key not in _SKIP_ATTRS:
                    item.attrs[key] = value


def clip_imerg(source: Path, target: Path, bbox: Bbox) -> None:
    import numpy as np
    import xarray as xr

    with xr.open_dataset(source, engine="h5netcdf", decode_cf=False) as src:
        lon, lat = np.asarray(src.lon), np.asarray(src.lat)
        xs = np.flatnonzero((lon >= bbox[0] - IMERG_PAD) & (lon <= bbox[2] + IMERG_PAD))
        ys = np.flatnonzero((lat >= bbox[1] - IMERG_PAD) & (lat <= bbox[3] + IMERG_PAD))
        if not len(xs) or not len(ys):
            raise ValueError("no native IMERG window")
        src[["precipitation"]].isel(
            lon=slice(int(xs.min()), int(xs.max()) + 1),
            lat=slice(int(ys.min()), int(ys.max()) + 1),
        ).load().to_netcdf(target, engine="h5netcdf")


CLIPPERS: dict[str, Callable[[Path, Path, Bbox], None]] = {
    "smap": clip_smap,
    "imerg": clip_imerg,
}
