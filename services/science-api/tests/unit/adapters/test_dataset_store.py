import json
import shutil
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import pytest
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.dataset_store import StoreGranuleReader, _file_day
from itza_science.adapters.granules import Granule
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.contracts.canonical_series_schema import Var
from tests.ldas_support import LDAS_FIXTURES
from tests.support import GRANULE_FIXTURES

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

FIELD = box(5.32804, 36.11842, 5.33196, 36.12158)
BBOX = (5.32804, 36.11842, 5.33196, 36.12158)
IMERG = ("GPM_3IMERGDF", "07")
SMAP = ("SPL4SMGP", "008")


class LiveReader:
    """Stands in for Earthdata and records every call."""

    def __init__(self, credentials: bool = True) -> None:
        self.calls: list[tuple[str, date]] = []
        self.credentials = credentials

    def credentials_available(self) -> bool:
        return self.credentials

    async def search_day(
        self, short_name: str, version: str, bbox: tuple[float, float, float, float], day: date
    ) -> list[Granule]:
        self.calls.append((short_name, day))
        return []


def imerg_name(day: date) -> str:
    return f"3B-DAY.MS.MRG.3IMERG.{day:%Y%m%d}-S000000-E235959.V07B.nc4"


def smap_name(day: date) -> str:
    return f"SMAP_L4_SM_gph_{day:%Y%m%d}T013000_Vv8013_001.h5"


def make_store(
    root: Path, imerg_days: list[date] | None = None, smap_days: list[date] | None = None
) -> Path:
    for folder, days, name, fixture in (
        ("derived/gpm-imerg/v07-clips/setif", imerg_days or [], imerg_name, "imerg_final_clear.nc"),
        ("derived/smap-l4/v8-clips/setif", smap_days or [], smap_name, "smap_l4_clear.nc"),
    ):
        (root / folder).mkdir(parents=True, exist_ok=True)
        for day in days:
            shutil.copy(GRANULE_FIXTURES / fixture, root / folder / name(day))
    return root


def reader(root: Path, live: LiveReader | None = None) -> tuple[StoreGranuleReader, LiveReader]:
    live = live or LiveReader()
    return StoreGranuleReader(root, live), live


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        (imerg_name(date(2020, 3, 4)), date(2020, 3, 4)),
        (smap_name(date(2016, 12, 31)), date(2016, 12, 31)),
        ("3B-DAY.MS.MRG.3IMERG.20201341-S0.nc4", None),
        ("no-date.h5", None),
    ],
)
def test_the_day_comes_from_the_granule_file_name(name: str, expected: date | None) -> None:
    assert _file_day(name) == expected


async def test_a_stored_day_is_served_without_calling_earthdata(tmp_path: Path) -> None:
    day = date(2020, 1, 8)
    store, live = reader(make_store(tmp_path, [day], [day]))
    imerg = await store.search_day(*IMERG, BBOX, day)
    smap = await store.search_day(*SMAP, BBOX, day)
    assert [g.path.name for g in imerg] == [imerg_name(day)]
    assert [g.path.name for g in smap] == [smap_name(day)]
    assert imerg[0].data_date == day
    assert live.calls == []


async def test_a_day_with_no_file_inside_the_stored_period_is_a_gap_not_a_live_call(
    tmp_path: Path,
) -> None:
    store, live = reader(make_store(tmp_path, [date(2020, 1, 1), date(2020, 1, 15)]))
    assert await store.search_day(*IMERG, BBOX, date(2020, 1, 8)) == []
    assert live.calls == []


async def test_a_batch_reader_fetches_a_day_with_no_stored_file_live(tmp_path: Path) -> None:
    root = make_store(tmp_path, [date(2020, 1, 1), date(2020, 1, 15)])
    live = LiveReader()
    store = StoreGranuleReader(root, live, gaps_are_final=False)
    assert [g.data_date for g in await store.search_day(*IMERG, BBOX, date(2020, 1, 1))] == [
        date(2020, 1, 1)
    ]
    await store.search_day(*IMERG, BBOX, date(2020, 1, 8))
    assert live.calls == [("GPM_3IMERGDF", date(2020, 1, 8))]


async def test_a_day_outside_the_stored_period_falls_back_to_earthdata(tmp_path: Path) -> None:
    store, live = reader(make_store(tmp_path, [date(2020, 1, 1), date(2020, 1, 15)]))
    await store.search_day(*IMERG, BBOX, date(2019, 12, 31))
    await store.search_day(*IMERG, BBOX, date(2020, 1, 16))
    assert [d for _, d in live.calls] == [date(2019, 12, 31), date(2020, 1, 16)]


async def test_a_field_outside_every_stored_region_falls_back_to_earthdata(tmp_path: Path) -> None:
    store, live = reader(make_store(tmp_path, [date(2020, 1, 1)]))
    await store.search_day(*IMERG, (-103.15, 40.15, -103.14, 40.16), date(2020, 1, 1))
    assert live.calls == [("GPM_3IMERGDF", date(2020, 1, 1))]


@pytest.mark.parametrize(
    "product", [("GPM_3IMERGDL", "07"), ("HLSL30_VI", "2.0"), ("SPL4SMGP", "007")]
)
async def test_products_that_are_not_stored_go_to_earthdata(
    tmp_path: Path, product: tuple[str, str]
) -> None:
    store, live = reader(make_store(tmp_path, [date(2020, 1, 1)]))
    await store.search_day(*product, BBOX, date(2020, 1, 1))
    assert len(live.calls) == 1


async def test_an_unreadable_file_falls_back_to_earthdata(tmp_path: Path) -> None:
    day = date(2020, 1, 8)
    root = make_store(tmp_path, [day])
    (root / "derived/gpm-imerg/v07-clips/setif" / imerg_name(day)).write_bytes(b"<html>error")
    # the extent comes from another readable file, so the region stays usable
    other = date(2020, 1, 1)
    shutil.copy(
        GRANULE_FIXTURES / "imerg_final_clear.nc",
        root / "derived/gpm-imerg/v07-clips/setif" / imerg_name(other),
    )
    store, live = reader(root)
    assert await store.search_day(*IMERG, BBOX, day) == []  # the day has a file, but it is bad
    assert live.calls == [("GPM_3IMERGDF", day)]


async def test_a_region_whose_files_cannot_be_read_is_skipped(tmp_path: Path) -> None:
    day = date(2020, 1, 1)
    root = make_store(tmp_path, [day])
    (root / "derived/gpm-imerg/v07-clips/setif" / imerg_name(day)).write_bytes(b"junk")
    store, live = reader(root)
    await store.search_day(*IMERG, BBOX, day)
    assert len(live.calls) == 1


async def test_a_missing_or_empty_store_uses_earthdata(tmp_path: Path) -> None:
    store, live = reader(tmp_path / "nowhere")
    await store.search_day(*IMERG, BBOX, date(2020, 1, 1))
    (tmp_path / "derived/gpm-imerg/v07-clips/setif").mkdir(parents=True)
    (tmp_path / "derived/gpm-imerg/v07-clips/.scratch-1").mkdir()
    (tmp_path / "derived/gpm-imerg/v07-clips/setif/notes.txt").write_text("x")
    empty, live2 = reader(tmp_path)
    await empty.search_day(*IMERG, BBOX, date(2020, 1, 1))
    assert len(live.calls) == 1
    assert len(live2.calls) == 1


def test_credentials_are_not_needed_when_the_store_exists(tmp_path: Path) -> None:
    assert StoreGranuleReader(tmp_path, LiveReader(credentials=False)).credentials_available()
    assert not StoreGranuleReader(
        tmp_path / "nowhere", LiveReader(credentials=False)
    ).credentials_available()
    assert StoreGranuleReader(tmp_path / "nowhere", LiveReader()).credentials_available()


async def test_imerg_adapter_reads_the_store_with_no_network_or_credentials(
    tmp_path: Path,
) -> None:
    days = [date(2020, 1, 1), date(2020, 1, 3)]
    store, live = reader(make_store(tmp_path, days), LiveReader(credentials=False))
    period = Period(start=date(2020, 1, 1), end=date(2020, 1, 3))
    result = await ImergAdapter(store).fetch(FIELD, period, (Var.precip,))
    # Final comes from the store; only the unsampled day tries the Late product live.
    assert live.calls == [("GPM_3IMERGDL", date(2020, 1, 2))]
    series = result.series[0]
    assert series.values[0] is not None
    assert series.values[2] is not None
    assert series.values[1] is None  # no Late granule either, so it stays a gap
    assert series.provenance.product == "GPM_3IMERGDF"


async def test_smap_adapter_reads_the_store_and_flags_the_single_granule_day(
    tmp_path: Path,
) -> None:
    day = date(2020, 1, 1)
    store, live = reader(make_store(tmp_path, None, [day]), LiveReader(credentials=False))
    result = await SmapL4Adapter(store).fetch(
        FIELD, Period(start=day, end=day), (Var.sm_surface, Var.sm_rootzone)
    )
    assert live.calls == []
    assert {s.var for s in result.series} == {Var.sm_surface, Var.sm_rootzone}
    assert all(s.values[0] is not None for s in result.series)


async def test_ldas_store_keeps_next_midnight_and_never_uses_network(tmp_path: Path) -> None:

    manifest = json.loads((LDAS_FIXTURES / "nldas_noah/manifest.json").read_text())
    folder = tmp_path / "derived/nldas-noah/v2.0-clips/akron"
    folder.mkdir(parents=True)
    for name, url in manifest["origin_urls"].items():
        shutil.copy(LDAS_FIXTURES / "nldas_noah" / name, folder / Path(urlparse(url).path).name)
    live = LiveReader(credentials=False)
    store = StoreGranuleReader(tmp_path, live, allow_live=False)
    files = await store.search_day(
        "NLDAS_NOAH0125_H", "2.0", tuple(manifest["bbox"]), date(2014, 6, 1)
    )
    assert len(files) == 25
    assert await store.search_day("NLDAS_NOAH0125_H", "2.0", BBOX, date(2010, 1, 1)) == []
    assert live.calls == []
