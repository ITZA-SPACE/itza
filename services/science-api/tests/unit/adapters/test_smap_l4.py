from datetime import date

import pytest
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.contracts.canonical_series_schema import Var
from tests.support import GRANULE_FIXTURES, FakeGranuleReader

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

FIELD = box(5.32804, 36.11842, 5.33196, 36.12158)
PERIOD = Period(start=date(2026, 1, 1), end=date(2026, 1, 2))


async def test_daily_mean_of_the_3_hourly_product() -> None:
    reader = FakeGranuleReader(
        files={("SPL4SMGP", date(2026, 1, 1)): GRANULE_FIXTURES / "smap_l4_clear.nc"}
    )
    result = await SmapL4Adapter(reader).fetch(FIELD, PERIOD, (Var.sm_surface, Var.sm_rootzone))
    assert result.gaps == []
    by_var = {s.var: s for s in result.series}
    assert by_var[Var.sm_surface].values[0] == pytest.approx(0.22, abs=0.02)
    assert by_var[Var.sm_rootzone].values[0] == pytest.approx(0.28, abs=0.02)
    assert by_var[Var.sm_surface].provenance.resolution_m == 9_000.0
    assert by_var[Var.sm_surface].values[1] is None
    assert by_var[Var.sm_surface].quality[1] == 2


async def test_requesting_only_one_variable_returns_only_that_series() -> None:
    reader = FakeGranuleReader(
        files={("SPL4SMGP", date(2026, 1, 1)): GRANULE_FIXTURES / "smap_l4_clear.nc"}
    )
    result = await SmapL4Adapter(reader).fetch(FIELD, PERIOD, (Var.sm_surface,))
    assert [s.var for s in result.series] == [Var.sm_surface]


async def test_no_granule_at_all_is_a_gap_per_variable() -> None:
    reader = FakeGranuleReader(files={})
    result = await SmapL4Adapter(reader).fetch(FIELD, PERIOD, (Var.sm_surface, Var.sm_rootzone))
    assert result.series == []
    assert {g.var for g in result.gaps} == {"sm_surface", "sm_rootzone"}


async def test_missing_credentials_is_a_gap() -> None:
    reader = FakeGranuleReader(credentials=False)
    result = await SmapL4Adapter(reader).fetch(FIELD, PERIOD, (Var.sm_surface, Var.sm_rootzone))
    assert result.series == []
    assert all("credentials" in g.reason for g in result.gaps)


def test_capabilities() -> None:
    caps = SmapL4Adapter(FakeGranuleReader()).capabilities()
    assert set(caps.variables) == {Var.sm_surface, Var.sm_rootzone}
    assert caps.resolution_m == 9_000.0
