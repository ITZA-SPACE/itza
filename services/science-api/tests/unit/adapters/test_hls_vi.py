from datetime import date

import pytest
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.contracts.canonical_series_schema import Var
from tests.support import GRANULE_FIXTURES, FakeGranuleReader

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

FIELD = box(5.32804, 36.11842, 5.33196, 36.12158)
PERIOD = Period(start=date(2026, 1, 1), end=date(2026, 1, 2))


async def test_clear_scene_is_high_quality() -> None:
    reader = FakeGranuleReader(
        files={("HLSL30_VI", date(2026, 1, 1)): GRANULE_FIXTURES / "hls_vi_clear.tif"}
    )
    result = await HlsViAdapter(reader).fetch(FIELD, PERIOD, (Var.ndvi,))
    series = result.series[0]
    assert series.values[0] == pytest.approx(0.62, abs=0.02)
    assert series.quality[0] == 0
    assert series.provenance.resolution_m == 30.0


async def test_mostly_cloudy_scene_is_degraded_quality() -> None:
    reader = FakeGranuleReader(
        files={("HLSL30_VI", date(2026, 1, 1)): GRANULE_FIXTURES / "hls_vi_partly_cloudy.tif"}
    )
    result = await HlsViAdapter(reader).fetch(FIELD, PERIOD, (Var.ndvi,))
    series = result.series[0]
    assert series.quality[0] == 1


async def test_falls_back_from_l30_to_s30() -> None:
    reader = FakeGranuleReader(
        files={("HLSS30_VI", date(2026, 1, 1)): GRANULE_FIXTURES / "hls_vi_clear.tif"}
    )
    result = await HlsViAdapter(reader).fetch(FIELD, PERIOD, (Var.ndvi,))
    assert result.series[0].values[0] == pytest.approx(0.62, abs=0.02)


async def test_no_scene_at_all_is_a_gap() -> None:
    reader = FakeGranuleReader(files={})
    result = await HlsViAdapter(reader).fetch(FIELD, PERIOD, (Var.ndvi,))
    assert result.series == []
    assert result.gaps[0].var == "ndvi"


async def test_missing_credentials_is_a_gap() -> None:
    reader = FakeGranuleReader(credentials=False)
    result = await HlsViAdapter(reader).fetch(FIELD, PERIOD, (Var.ndvi,))
    assert result.series == []
    assert "credentials" in result.gaps[0].reason


def test_capabilities() -> None:
    caps = HlsViAdapter(FakeGranuleReader()).capabilities()
    assert caps.variables == (Var.ndvi,)
    assert caps.resolution_m == 30.0
