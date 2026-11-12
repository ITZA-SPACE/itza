"""Bounded recent-scene search; downloaded native inputs live only during decoding."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Protocol

from itza_science.adapters.base import Period
from itza_science.adapters.granules import EarthaccessGranuleReader, GranuleAccessError
from itza_science.context.models import BBox


@dataclass(frozen=True)
class Scene:
    id: str
    day: date
    assets: dict[str, Path]


@dataclass(frozen=True)
class Search:
    product: str
    version: str
    bbox: BBox
    period: Period | None
    limit: int = 4


class Archive(Protocol):
    async def read[T](self, query: Search, decode: Callable[[list[Scene], bool], T]) -> T: ...


class EarthdataArchive:
    def __init__(self, reader: EarthaccessGranuleReader, root: Path) -> None:
        self.reader = reader
        self.root = root

    async def read[T](self, query: Search, decode: Callable[[list[Scene], bool], T]) -> T:
        if not self.reader.credentials_available():
            raise GranuleAccessError("Earthdata credentials are not configured")
        return await asyncio.to_thread(self._read, query, decode)

    def _read[T](self, query: Search, decode: Callable[[list[Scene], bool], T]) -> T:
        self.root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix="context-", dir=self.root) as folder:
            scenes, truncated = self.reader.run_authenticated(lambda: self._download(query, folder))
            # HDF/raster decoding does not hold earthaccess's process-global auth lock.
            return decode(scenes, truncated)

    @staticmethod
    def _download(query: Search, folder: str) -> tuple[list[Scene], bool]:
        import earthaccess  # noqa: PLC0415 -- defer SDK initialization until data is requested

        if not earthaccess.login(strategy="environment", persist=False).authenticated:
            raise GranuleAccessError("Earthdata authentication failed")
        args: dict[str, Any] = {
            "short_name": query.product,
            "version": query.version,
            "bounding_box": query.bbox,
            "count": query.limit + 1,
            "sort_key": ["-start_date"],
        }
        if query.period is not None:
            args["temporal"] = (query.period.start.isoformat(), query.period.end.isoformat())
        results = earthaccess.search_data(**args)
        scenes = []
        for result in results[: query.limit]:
            umm = result["umm"]
            extent = umm["TemporalExtent"]
            observed = extent.get("SingleDateTime") or extent["RangeDateTime"]["BeginningDateTime"]
            day = date.fromisoformat(str(observed)[:10])
            if query.period is not None and not query.period.start <= day <= query.period.end:
                continue
            urls = [u for u in result.data_links(access="external") if _wanted(u, query.product)]
            if not urls:
                continue
            paths = [
                Path(p) for p in earthaccess.download(urls, folder, threads=1, show_progress=False)
            ]
            if len(paths) != len(urls):
                raise GranuleAccessError("incomplete context download")
            scenes.append(Scene(str(umm["GranuleUR"]), day, {p.name: p for p in paths}))
        return scenes, len(results) > query.limit


def _wanted(url: str, product: str) -> bool:
    name = url.lower()
    if product.startswith("ECO_"):
        return name.endswith(
            tuple("_" + v + ".tif" for v in ("lst", "qc", "cloud", "water", "esi"))
        )
    return name.endswith((".h5", ".hdf5", ".nc", ".nc4"))
