"""Serve SMAP L4, IMERG and Noah clips from the team dataset store before calling Earthdata (issue #125).

The store (`pipelines/data_store`) holds clips of the hero regions as
``<product folder>/<region>/<granule file>``. In Cloud Run the bucket is mounted read-only, so
this reader only reads local files. It plugs into the adapters as a ``GranuleReader``.

Coverage is partial by design (IMERG one day in seven, SMAP one granule every 15 days for most of
the period), so inside a stored region the store is authoritative: a day without a file is "no
data", never a live call per day. Live Earthdata is used when the field is outside every stored
region, the day is outside the stored period, the product is not stored, or a file cannot be read.
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import xarray as xr

from itza_science.adapters.granules import Granule, GranuleReader

logger = logging.getLogger(__name__)

Bbox = tuple[float, float, float, float]

# (short name, version) -> (folder in the store, data file suffixes)
STORE_PRODUCTS: dict[tuple[str, str], tuple[str, tuple[str, ...]]] = {
    ("GPM_3IMERGDF", "07"): ("derived/gpm-imerg/v07-clips", (".nc4", ".nc")),
    ("GLDAS_NOAH025_3H", "2.1"): ("derived/gldas-noah/v2.1-clips", (".nc4", ".nc")),
    ("NLDAS_NOAH0125_H", "2.0"): ("derived/nldas-noah/v2.0-clips", (".nc4", ".nc")),
    ("SPL4SMGP", "008"): ("derived/smap-l4/v8-clips", (".h5",)),
}
_DAY = re.compile(r"(?<!\d)(\d{4})(\d{2})(\d{2})(?=[T.-])")


@dataclass(frozen=True)
class _Region:
    extent: Bbox  # west, south, east, north of the clipped cell centres
    files: dict[date, list[Path]]

    @property
    def first(self) -> date:
        return min(self.files)

    @property
    def last(self) -> date:
        return max(self.files)

    def covers(self, bbox: Bbox) -> bool:
        w, s, e, n = self.extent
        return w <= bbox[0] and s <= bbox[1] and bbox[2] <= e and bbox[3] <= n


def _file_day(name: str) -> date | None:
    match = _DAY.search(name)
    if match is None:
        return None
    try:
        return date(int(match[1]), int(match[2]), int(match[3]))
    except ValueError:
        return None


def _extent(path: Path) -> Bbox:
    """Lon/lat extent of a clip, for the native IMERG grid and the SMAP cell coordinates."""
    with xr.open_dataset(path, engine="h5netcdf", phony_dims="access") as ds:
        lon_name, lat_name = ("lon", "lat") if "lon" in ds else ("cell_lon", "cell_lat")
        lon, lat = ds[lon_name].values, ds[lat_name].values
        return float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())


def _readable(path: Path) -> bool:
    try:
        with xr.open_dataset(path, engine="h5netcdf", phony_dims="access"):
            return True
    except Exception:  # any unreadable file means: use the live source
        return False


class StoreGranuleReader:
    """Wrap a live reader with native product clips and optional store-only access."""

    def __init__(
        self,
        store_dir: Path,
        live: GranuleReader,
        *,
        gaps_are_final: bool = True,
        allow_live: bool = True,
    ) -> None:
        """``gaps_are_final=False`` fetches a day with no stored file live (batch pipelines)."""
        self._allow_live = allow_live
        self._store_dir = store_dir
        self._live = live
        self._gaps_are_final = gaps_are_final
        self._index: dict[str, list[_Region]] = {}
        self._lock = threading.Lock()

    def credentials_available(self) -> bool:
        return self._live.credentials_available() or self._store_dir.is_dir()

    async def search_day(
        self, short_name: str, version: str, bbox: Bbox, day: date
    ) -> list[Granule]:
        product = STORE_PRODUCTS.get((short_name, version))
        if product is not None:
            regions = await asyncio.to_thread(self._regions, *product)
            for region in regions:
                if not region.covers(bbox) or not region.first <= day <= region.last:
                    continue
                granules = [
                    Granule(path=path, data_date=day)
                    for path in (
                        region.files.get(day, [])
                        + (
                            region.files.get(day + timedelta(days=1), [])
                            if short_name.startswith(("GLDAS", "NLDAS"))
                            else []
                        )
                    )
                    if await asyncio.to_thread(_readable, path)
                ]
                if granules or (day not in region.files and self._gaps_are_final):
                    return granules  # stored region: a day with no file is a gap, not a live call
                if day in region.files:
                    logger.warning("dataset store file unreadable for %s on %s", short_name, day)
        if not self._allow_live:
            return []
        return await self._live.search_day(short_name, version, bbox, day)

    def _regions(self, folder: str, suffixes: tuple[str, ...]) -> list[_Region]:
        """Index one product once: region folders, their files by day and their extent."""
        with self._lock:
            if folder not in self._index:
                self._index[folder] = self._scan(self._store_dir / folder, suffixes)
            return self._index[folder]

    @staticmethod
    def _scan(root: Path, suffixes: tuple[str, ...]) -> list[_Region]:
        regions: list[_Region] = []
        if not root.is_dir():
            return regions
        for folder in sorted(
            p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")
        ):
            files: dict[date, list[Path]] = {}
            for path in sorted(folder.iterdir()):
                day = _file_day(path.name)
                if day is not None and path.name.lower().endswith(suffixes):
                    files.setdefault(day, []).append(path)
            if not files:
                continue
            try:
                extent = _extent(next(iter(files.values()))[0])
            except Exception:  # an unreadable region is skipped, not fatal
                logger.warning("dataset store region %s is unreadable", folder, exc_info=True)
                continue
            regions.append(_Region(extent=extent, files=files))
        return regions
