from datetime import date

import pytest
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.imerg import ImergAdapter
from itza_science.contracts.canonical_series_schema import Var
from tests.support import GRANULE_FIXTURES, FakeGranuleReader

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

FIELD = box(5.32804, 36.11842, 5.33196, 36.12158)
PERIOD = Period(start=date(2026, 1, 1), end=date(2026, 1, 2))


async def test_final_daily_is_preferred_when_available() -> None:
    reader = FakeGranuleReader(
        files={("GPM_3IMERGDF", date(2026, 1, 1)): GRANULE_FIXTURES / "imerg_final_clear.nc"}
    )
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, (Var.precip,))
    assert result.gaps == []
    series = result.series[0]
    assert series.values[0] == pytest.approx(4.2, abs=0.01)
    assert series.quality[0] == 0
    assert series.provenance.source == "gpm_imerg_final_daily"
    assert series.provenance.resolution_m == 11_000.0


async def test_falls_back_to_late_daily_and_records_a_segment() -> None:
    reader = FakeGranuleReader(
        files={("GPM_3IMERGDL", date(2026, 1, 1)): GRANULE_FIXTURES / "imerg_late_clear.nc"}
    )
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, (Var.precip,))
    series = result.series[0]
    assert series.values[0] == pytest.approx(3.8, abs=0.01)
    assert series.quality[0] == 0  # Late is an observation, not a gap-filled estimate.
    assert series.segments is not None
    assert series.segments[0].source == "gpm_imerg_late_daily"
    assert series.segments[0].start == date(2026, 1, 1)


async def test_missing_day_is_null_with_missing_quality() -> None:
    reader = FakeGranuleReader(
        files={("GPM_3IMERGDF", date(2026, 1, 1)): GRANULE_FIXTURES / "imerg_final_clear.nc"}
    )
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, (Var.precip,))
    series = result.series[0]
    assert series.values[1] is None
    assert series.quality[1] == 2


async def test_no_data_at_all_is_a_gap_not_a_crash() -> None:
    reader = FakeGranuleReader(files={})
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, (Var.precip,))
    assert result.series == []
    assert result.gaps[0].var == "precip"
    assert result.gaps[0].severity == "warning"


async def test_missing_credentials_is_a_gap_and_never_searches() -> None:
    reader = FakeGranuleReader(credentials=False)
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, (Var.precip,))
    assert result.series == []
    assert "credentials" in result.gaps[0].reason


async def test_variable_not_requested_is_skipped() -> None:
    reader = FakeGranuleReader(files={})
    result = await ImergAdapter(reader).fetch(FIELD, PERIOD, ())
    assert result.series == []
    assert result.gaps == []


def test_capabilities_report_precip_and_resolution() -> None:
    caps = ImergAdapter(FakeGranuleReader()).capabilities()
    assert caps.variables == (Var.precip,)
    assert caps.resolution_m == 11_000.0
    assert caps.auth == "earthdata"
