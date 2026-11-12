from datetime import UTC, datetime
from pathlib import Path

import h5py
import numpy as np
import rasterio
import xarray as xr
from pyproj import Transformer
from rasterio.transform import from_origin

root = Path(__file__).resolve().parent
root.mkdir(parents=True, exist_ok=True)
x, y = Transformer.from_crs(4326, 6933, always_xy=True).transform(5.33, 36.12)
with h5py.File(root / "nisar.h5", "w") as f:
    g = f.create_group("science/LSAR/SME2/grids")
    g["xCoordinates"] = np.arange(4) * 200 + x - 300
    g["yCoordinates"] = y + 300 - np.arange(4) * 200
    g["projection"] = 6933
    data = np.full((4, 4), 0.3, dtype="float32")
    data[1, 1] = 0.1
    data[1, 2] = 0.9
    data[2, 1] = 0.8
    data[2, 2] = 0.4
    ds = g.create_dataset("soilMoisture", data=data)
    ds.attrs["_FillValue"] = -9999.0
    flags = np.zeros((4, 4), dtype="uint8")
    flags[1, 2] = 1
    g["retrievalQualityFlag"] = flags
    flags = np.zeros((4, 4), dtype="uint8")
    flags[2, 1] = 4
    g["ancillaryData/surfaceQualityFlag"] = flags

dates = np.arange("2023-01", "2026-01", dtype="datetime64[M]").astype("datetime64[D]")
xyears = (dates - dates[0]).astype(float) / 365.2425
values = np.broadcast_to((2 * xyears)[:, None, None], (36, 3, 3)).copy()
values[5, :, :] = np.nan
keep = np.arange(36) != 17
ds = xr.Dataset(
    {
        "lwe_thickness": (("time", "lat", "lon"), values[keep], {"units": "cm"}),
        "land_mask": (("lat", "lon"), np.ones((3, 3), dtype="int8")),
        "scale_factor": (("lat", "lon"), np.full((3, 3), 2.0)),
    },
    coords={"time": dates[keep], "lat": [35.5, 36.0, 36.5], "lon": [5.0, 5.5, 6.0]},
)
ds.to_netcdf(root / "grace.nc", engine="h5netcdf")

for kind in ("A", "B"):
    with h5py.File(root / f"gedi_{kind.lower()}.h5", "w") as f:
        f.create_group("METADATA")
        b = f.create_group("BEAM0000")
        geo = b if kind == "A" else b.create_group("geolocation")
        geo["lat_lowestmode"] = np.array([36.12, 36.12, 36.125, 36.16, 36.12, 36.12, 36.12, 36.12])
        geo["lon_lowestmode"] = np.array([5.33, 5.331, 5.33, 5.33, 5.33, 5.33, 5.33, 5.33])
        quality = np.ones(8, dtype="uint8")
        quality[4] = 0
        b["quality_flag" if kind == "A" else "l2b_quality_flag"] = quality
        degrade = np.zeros(8, dtype="uint8")
        degrade[5] = 1
        geo["degrade_flag"] = degrade
        b["sensitivity"] = np.array([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.7, 0.99])
        b["shot_number"] = np.arange(10000000000000000, 10000000000000008, dtype="uint64")
        seconds = (
            datetime(2025, 6, 1, tzinfo=UTC) - datetime(2018, 1, 1, tzinfo=UTC)
        ).total_seconds()
        geo["delta_time"] = np.full(8, seconds)
        if kind == "A":
            heights = np.full((8, 101), 10.0)
            heights[7, 98] = -9999
            b["rh"] = heights
        else:
            cover = np.full(8, 0.6)
            cover[7] = -9999
            b["cover"] = cover

x, y = Transformer.from_crs(4326, 32631, always_xy=True).transform(5.33, 36.12)
transform = from_origin(x - 280, y + 280, 70, 70)
for variable in ("LST", "ESI", "QC", "cloud", "water"):
    values = np.full(
        (8, 8), 300.0 if variable == "LST" else 0.6 if variable == "ESI" else 0.0, dtype="float32"
    )
    if variable == "QC":
        values[3, 3] = 3
    if variable == "cloud":
        values[3, 4] = 1
    if variable == "water":
        values[4, 3] = 1
    with rasterio.open(
        root / f"scene_{variable}.tif",
        "w",
        driver="GTiff",
        height=8,
        width=8,
        count=1,
        dtype="float32",
        crs="EPSG:32631",
        transform=transform,
        nodata=-9999.0,
        compress="deflate",
    ) as f:
        f.write(values, 1)
