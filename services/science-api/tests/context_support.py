"""Offline archive for explicitly synthetic, native-shaped context granules."""

import asyncio
from collections.abc import Callable
from datetime import date
from pathlib import Path

from itza_science.adapters.context_archive import Scene, Search
from itza_science.context.products import GRACE, NISAR
from tests.support import GRANULE_FIXTURES

FIXTURES = Path(__file__).parent / "fixtures" / "context"
BOUNDS = (5.32804, 36.11842, 5.33196, 36.12158)
DAY = date(2026, 9, 1)


class FixtureArchive:
    def __init__(self, *, empty: bool = False, fail: bool = False, delay: float = 0) -> None:
        self.empty, self.fail, self.delay = empty, fail, delay
        self.queries: list[Search] = []

    async def read[T](self, query: Search, decode: Callable[[list[Scene], bool], T]) -> T:
        self.queries.append(query)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise RuntimeError("private-upstream-token")
        files = {
            NISAR: FIXTURES / "nisar.h5",
            GRACE: FIXTURES / "grace.nc",
            "GEDI02_A": FIXTURES / "gedi_a.h5",
            "GEDI02_B": FIXTURES / "gedi_b.h5",
            "SPL4SMGP": GRANULE_FIXTURES / "smap_l4_clear.nc",
        }
        if query.product.startswith("ECO_"):
            assets = {p.name: p for p in FIXTURES.glob("*.tif")}
        else:
            path = files[query.product]
            assets = {path.name: path}
        scenes = [] if self.empty else [Scene(query.product + "-synthetic", DAY, assets)]
        return await asyncio.to_thread(decode, scenes, False)
