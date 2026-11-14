"""Regression oracles sampled from actual NASA granules before clipping."""

import hashlib

import pytest

from itza_science.adapters.base import Period
from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.contracts.canonical_series_schema import Var
from itza_science.core.field import to_shapely
from itza_science.core.manifest import load_manifest
from tests.recorded_support import RECORDED, RecordedClip, RecordedReader, recorded_clips

pytestmark = [pytest.mark.unit, pytest.mark.anyio]
SOURCES = {
    "GPM_3IMERGDF": "gpm_imerg_final_daily",
    "GPM_3IMERGDL": "gpm_imerg_late_daily",
    "SPL4SMGP": "smap_l4",
    "HLSL30_VI": "hls_vi",
    "HLSS30_VI": "hls_vi",
}


@pytest.mark.parametrize("clip", recorded_clips(), ids=lambda clip: clip.collection)
async def test_recorded_granule_values_and_full_provenance(clip: RecordedClip) -> None:
    source = load_manifest().sources[SOURCES[clip.collection]]
    cls = (
        ImergAdapter
        if clip.collection.startswith("GPM")
        else (SmapL4Adapter if clip.collection == "SPL4SMGP" else HlsViAdapter)
    )
    request = clip.request()
    result = await cls(RecordedReader([clip])).fetch(
        to_shapely(request.geometry),
        Period(start=clip.day, end=clip.day),
        tuple(Var(v) for v in clip.expected),
    )
    series = {s.var.value: s for s in result.series}
    assert set(series) == set(clip.expected)
    for variable, expected in clip.expected.items():
        observed = series[variable]
        assert observed.values == [pytest.approx(expected, rel=1e-5, abs=1e-8)]
        assert observed.quality == [0]
        assert observed.provenance.version == clip.version
        assert observed.provenance.resolution_m == source.resolution_m
        assert observed.unit == source.variables[variable].unit
        assert clip.collection in observed.provenance.product
        assert observed.provenance.source == source.id
        assert observed.provenance.period.start == clip.day
        assert observed.provenance.period.end == clip.day
        assert observed.provenance.retrieved is not None
        assert observed.provenance.method is not None
    assert hashlib.sha256((RECORDED / clip.file).read_bytes()).hexdigest() == clip.sha256
    if clip.qa_file is not None:
        assert hashlib.sha256((RECORDED / clip.qa_file).read_bytes()).hexdigest() == clip.qa_sha256


async def test_recorded_smap_daily_average_uses_both_three_hourly_samples() -> None:
    samples = [c for c in recorded_clips() if c.collection == "SPL4SMGP"]
    assert len(samples) == 2
    assert samples[0].day == samples[1].day
    adapter = SmapL4Adapter(RecordedReader(samples))
    result = await adapter.fetch(
        to_shapely(samples[0].request().geometry),
        Period(samples[0].day, samples[0].day),
        (Var.sm_surface, Var.sm_rootzone),
    )
    for series in result.series:
        expected = sum(c.expected[series.var.value] for c in samples) / len(samples)
        assert series.values == [pytest.approx(expected)]
        assert series.provenance.quality.value == "low"
    assert any("fewer than 8" in g.reason for g in result.gaps)


def test_recorded_fixtures_cover_every_required_collection() -> None:
    assert {c.collection for c in recorded_clips()} == set(SOURCES)
