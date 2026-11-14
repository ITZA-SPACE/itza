from __future__ import annotations

from pathlib import Path

import h5py
import numpy as np
import pytest
import xarray as xr

import clip


def smap_file(path: Path) -> None:
    lat = np.linspace(40.5, 39.5, 11)  # rows run north to south, 0.1 degree apart
    lon = np.linspace(-103.5, -102.5, 11)
    with h5py.File(path, "w") as f:
        f.create_dataset("cell_lat", data=np.repeat(lat[:, None], 11, axis=1))
        f.create_dataset("cell_lon", data=np.repeat(lon[None, :], 11, axis=0))
        for name, offset in (("sm_surface", 0.1), ("sm_rootzone", 0.2)):
            item = f.create_dataset(f"Geophysical_Data/{name}", data=np.full((11, 11), offset))
            item.attrs["units"] = "m3 m-3"
            item.attrs["CLASS"] = "skipped"


def imerg_file(path: Path) -> None:
    lon = np.linspace(-103.45, -102.55, 10)
    lat = np.linspace(39.55, 40.45, 10)
    data = np.arange(100, dtype="float32").reshape(1, 10, 10)
    xr.Dataset(
        {"precipitation": (("time", "lon", "lat"), data)},
        coords={"time": [0], "lon": lon, "lat": lat},
    ).to_netcdf(path, engine="h5netcdf")


@pytest.mark.unit
def test_smap_clip_keeps_a_padded_window_and_the_attributes(tmp_path: Path) -> None:
    smap_file(tmp_path / "in.h5")
    clip.clip_smap(tmp_path / "in.h5", tmp_path / "out.h5", (-103.1, 39.95, -102.9, 40.05))
    with h5py.File(tmp_path / "out.h5") as out:
        lat, lon = out["cell_lat"][:, 0], out["cell_lon"][0, :]
        assert lat.min() <= 39.95 - 0.0 and lat.max() >= 40.05
        assert len(lat) < 11 and len(lon) < 11
        assert out["Geophysical_Data/sm_rootzone"].shape == (len(lat), len(lon))
        assert out["Geophysical_Data/sm_surface"].attrs["units"] == "m3 m-3"
        assert "CLASS" not in out["Geophysical_Data/sm_surface"].attrs


@pytest.mark.unit
def test_smap_clip_rejects_a_box_outside_the_grid(tmp_path: Path) -> None:
    smap_file(tmp_path / "in.h5")
    with pytest.raises(ValueError, match="no native SMAP window"):
        clip.clip_smap(tmp_path / "in.h5", tmp_path / "out.h5", (5.0, 36.0, 5.1, 36.1))


@pytest.mark.unit
def test_imerg_clip_keeps_precipitation_in_the_window(tmp_path: Path) -> None:
    imerg_file(tmp_path / "in.nc4")
    clip.clip_imerg(tmp_path / "in.nc4", tmp_path / "out.nc4", (-103.1, 39.95, -102.9, 40.05))
    with xr.open_dataset(tmp_path / "out.nc4", engine="h5netcdf", decode_cf=False) as out:
        assert list(out.data_vars) == ["precipitation"]
        assert out.sizes["lon"] < 10 and out.sizes["lat"] < 10


@pytest.mark.unit
def test_imerg_clip_rejects_a_box_outside_the_grid(tmp_path: Path) -> None:
    imerg_file(tmp_path / "in.nc4")
    with pytest.raises(ValueError, match="no native IMERG window"):
        clip.clip_imerg(tmp_path / "in.nc4", tmp_path / "out.nc4", (5.0, 36.0, 5.1, 36.1))
