from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import earthaccess
import numpy as np
import pytest
import xarray as xr
from shapely.geometry import box

from itza_science.adapters.base import Period
from itza_science.adapters.gldas import (
    GLDAS,
    NLDAS,
    GldasAdapter,
    LandSurfaceReader,
    clip,
    daily_values,
    merge_modeled_fallbacks,
)
from itza_science.adapters.granules import Granule
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.contracts.canonical_series_schema import CanonicalSeries, Var
from tests.ldas_support import DAY, FIELD, native_fixture
from tests.support import FakeGranuleReader

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("source", [GLDAS, NLDAS])
def test_native_mass_flux_and_midnight_bounds(tmp_path: Path, source: str) -> None:
    path = native_fixture(tmp_path / "sample.nc4", source)
    result = daily_values([Granule(path, DAY)], source, DAY, FIELD)
    assert result[Var.sm_rootzone] == pytest.approx(0.25)
    assert result[Var.et_actual] == pytest.approx(1.728)


@pytest.mark.parametrize("source", [GLDAS, NLDAS])
def test_partial_days_never_extrapolate(tmp_path: Path, source: str) -> None:
    original = native_fixture(tmp_path / "sample.nc4", source)
    with xr.open_dataset(original, engine="h5netcdf") as ds:
        ds.isel(time=[0, 1, 2]).load().to_netcdf(tmp_path / "partial.nc4", engine="h5netcdf")
    result = daily_values([Granule(tmp_path / "partial.nc4", DAY)], source, DAY, FIELD)
    assert result == {Var.sm_rootzone: None, Var.et_actual: None}


@pytest.mark.parametrize("case", ["units", "bounds", "duplicate", "grid"])
def test_invalid_source_fails_closed(tmp_path: Path, case: str) -> None:
    path = native_fixture(tmp_path / "original.nc4", GLDAS)
    with xr.open_dataset(path, engine="h5netcdf") as source:
        ds = source.load()
    if case == "units":
        ds["Evap_tavg"].attrs["units"] = "W m-2"
    elif case == "bounds":
        ds["time_bnds"][0, 0] = np.datetime64("2014-05-31T00")
    elif case == "grid":
        ds = ds.isel(lat=[0])
    ds.to_netcdf(tmp_path / "bad.nc4", engine="h5netcdf")
    files = [Granule(tmp_path / "bad.nc4", DAY)] * (2 if case == "duplicate" else 1)
    with pytest.raises(ValueError, match=r"unexpected|duplicate|invalid"):
        daily_values(files, GLDAS, DAY, FIELD)


@pytest.mark.anyio
@pytest.mark.parametrize("preferred", [GLDAS, NLDAS])
async def test_adapter_preference_and_modeled_flags(tmp_path: Path, preferred: str) -> None:
    path = native_fixture(tmp_path / "source.nc4", preferred)
    product = "GLDAS_NOAH025_3H" if preferred == GLDAS else "NLDAS_NOAH0125_H"
    reader = FakeGranuleReader(files={(product, DAY): path})
    result = await GldasAdapter(reader).fetch(
        FIELD, Period(DAY, DAY), (Var.sm_rootzone, Var.et_actual)
    )
    resolved = merge_modeled_fallbacks(result.series)
    assert len(resolved) == 2
    for series in resolved:
        assert series.provenance.source == preferred
        assert series.quality == [1]
        assert series.provenance.method is not None
        assert "modeled" in series.provenance.method
        assert series.provenance.quality.value == "low"


@pytest.mark.anyio
async def test_missing_auth_and_no_requested_variables() -> None:
    adapter = GldasAdapter(FakeGranuleReader(credentials=False))
    assert not (await adapter.fetch(FIELD, Period(DAY, DAY), (Var.ndvi,))).gaps
    assert (await adapter.fetch(FIELD, Period(DAY, DAY), (Var.sm_rootzone,))).gaps


@pytest.mark.parametrize("source", [GLDAS, NLDAS])
def test_signed_et_and_invalid_moisture(tmp_path: Path, source: str) -> None:
    path = native_fixture(tmp_path / "original.nc4", source)
    with xr.open_dataset(path, engine="h5netcdf") as original:
        ds = original.load().sortby("lat", ascending=False)
    ds["Evap_tavg" if source == GLDAS else "Evap"][:] = -0.001
    ds["SoilMoi0_10cm_inst" if source == GLDAS else "SoilM_0_100cm"][:] = np.nan
    ds.to_netcdf(tmp_path / "bad-moisture.nc4", engine="h5netcdf")
    result = daily_values([Granule(tmp_path / "bad-moisture.nc4", DAY)], source, DAY, FIELD)
    assert result[Var.sm_rootzone] is None
    assert result[Var.et_actual] == pytest.approx(-86.4 if source == GLDAS else -0.024)


def test_reader_clips_native_windows_and_reuses_cache(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = native_fixture(tmp_path / "native.nc4", GLDAS)
    monkeypatch.setattr(earthaccess, "login", lambda **_: SimpleNamespace(authenticated=True))
    result = SimpleNamespace(data_links=lambda **_: ["https://example.test/native.nc4"])
    searches = []

    def search(**query: Any) -> list[Any]:
        searches.append(query)
        return [result]

    monkeypatch.setattr(earthaccess, "search_data", search)
    monkeypatch.setattr(earthaccess, "open", lambda *_, **__: [original.open("rb")])
    reader = LandSurfaceReader(tmp_path / "cache")
    files = reader._download("GLDAS_NOAH025_3H", "2.1", FIELD.bounds, DAY)
    assert daily_values(files, GLDAS, DAY, FIELD)[Var.sm_rootzone] == pytest.approx(0.25)
    assert searches[0]["temporal"] == ("2014-06-01T00:00:00Z", "2014-06-02T00:00:00Z")
    monkeypatch.setattr(earthaccess, "open", lambda *_, **__: pytest.fail("cache missed"))
    assert reader._download("GLDAS_NOAH025_3H", "2.1", FIELD.bounds, DAY) == files
    with original.open("rb") as handle, pytest.raises(ValueError, match="outside"):
        clip(handle, tmp_path / "outside.nc4", (0, 0, 1, 1), GLDAS)


@pytest.mark.parametrize("case", ["period", "auth", "budget"])
def test_reader_rejects_unbounded_or_unauthenticated_requests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, case: str
) -> None:
    monkeypatch.setattr(
        earthaccess, "login", lambda **_: SimpleNamespace(authenticated=case != "auth")
    )
    monkeypatch.setattr(earthaccess, "search_data", lambda **_: [None] * 35)
    with pytest.raises(ValueError, match=r"require|authentication|budget"):
        LandSurfaceReader(tmp_path)._download(
            "NLDAS_NOAH0125_H", "2.0", FIELD.bounds, None if case == "period" else DAY
        )


@pytest.mark.anyio
async def test_unexpected_access_error_becomes_gap() -> None:
    class Broken(FakeGranuleReader):
        async def search_day(self, *args: Any, **kwargs: Any) -> list[Granule]:
            raise RuntimeError("unexpected upstream response")

    result = await GldasAdapter(Broken()).fetch(FIELD, Period(DAY, DAY), (Var.sm_rootzone,))
    assert not result.series
    assert len(result.gaps) == 2


def make_series(source: str, values: list[float | None], flags: list[int]) -> CanonicalSeries:
    return CanonicalSeries.model_validate(
        {
            "var": "sm_rootzone",
            "unit": "m3/m3",
            "cadence": "daily",
            "start": str(DAY),
            "values": values,
            "quality": flags,
            "provenance": {
                "source": source,
                "product": source,
                "version": "1",
                "resolution_m": 9000,
                "period": {"start": str(DAY), "end": "2014-06-04"},
                "quality": "medium",
                "retrieved": "2026-11-14",
            },
        }
    )


@pytest.mark.parametrize("order", [(0, 1, 2), (2, 0, 1), (1, 2, 0)])
def test_fallback_preserves_smap_and_source_switches(order: tuple[int, ...]) -> None:
    candidates = [
        make_series("smap_l4", [0.1, None, None, None], [0, 2, 2, 2]),
        make_series(NLDAS, [0.2, 0.2, None, None], [1, 1, 2, 2]),
        make_series(GLDAS, [0.3, 0.3, 0.3, None], [1, 1, 1, 2]),
    ]
    result = merge_modeled_fallbacks([candidates[i] for i in order])[0]
    assert result.values == [0.1, 0.2, 0.3, None]
    assert result.quality == [0, 1, 1, 2]
    assert result.segments is not None
    assert [segment.source for segment in result.segments] == ["smap_l4", NLDAS, GLDAS]
    assert result.provenance.quality.value == "low"
    assert result.provenance.derived_from == [GLDAS, NLDAS, "smap_l4"]
    repeated = merge_modeled_fallbacks([result, candidates[2]])[0]
    assert repeated.segments == result.segments
    assert repeated.values == result.values


def test_merge_empty_missing_and_incompatible_series() -> None:
    assert merge_modeled_fallbacks([]) == []
    missing = make_series(GLDAS, [None], [2])
    assert merge_modeled_fallbacks([missing, missing])[0].values == [None]
    incompatible = missing.model_copy(update={"unit": "fraction"})
    with pytest.raises(ValueError, match="incompatible"):
        merge_modeled_fallbacks([missing, incompatible])


@pytest.mark.anyio
async def test_complete_pre_2015_season_uses_global_model(tmp_path: Path) -> None:
    original = native_fixture(tmp_path / "original.nc4", GLDAS)
    calls: list[str] = []

    class SeasonReader(FakeGranuleReader):
        async def search_day(
            self, short_name: str, version: str, bbox: tuple[float, float, float, float], day: date
        ) -> list[Granule]:
            calls.append(short_name)
            path = tmp_path / f"{day}.nc4"
            with xr.open_dataset(original, engine="h5netcdf") as ds:
                shifted = ds.load()
            delta = np.timedelta64((day - DAY).days, "D")
            shifted["time"] = shifted.time + delta
            shifted["time_bnds"] = shifted.time_bnds + delta
            shifted.to_netcdf(path, engine="h5netcdf")
            return [Granule(path, day)]

    reader = SeasonReader()
    period = Period(date(2014, 5, 1), date(2014, 7, 31))
    # Outside NLDAS; geometry remains in the synthetic grid for this routing test.
    monkey_domain = box(0, 0, 1, 1)
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr("itza_science.adapters.gldas.NLDAS_DOMAIN", monkey_domain)
        primary = await SmapL4Adapter(reader).fetch(FIELD, period, (Var.sm_rootzone,))
        assert not calls  # No nonexistent pre-launch SMAP searches.
        result = await GldasAdapter(reader, history_reader=reader).fetch(
            FIELD, period, (Var.sm_rootzone,)
        )
    assert not primary.series
    assert calls == ["GLDAS_NOAH025_3H"] * 92
    assert result.series[0].values == pytest.approx([0.25] * 92)
    assert result.series[0].quality == [1] * 92


@pytest.mark.anyio
async def test_long_cold_request_never_opens_earthdata() -> None:
    class NoNetwork(FakeGranuleReader):
        async def search_day(self, *args: Any, **kwargs: Any) -> list[Granule]:
            pytest.fail("historical request opened Earthdata")

    result = await GldasAdapter(NoNetwork()).fetch(
        FIELD, Period(date(2010, 1, 1), date(2014, 12, 31)), (Var.sm_rootzone,)
    )
    assert not result.series
    assert "dataset-store" in result.gaps[0].reason
