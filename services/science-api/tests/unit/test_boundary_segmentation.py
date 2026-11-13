import asyncio
import itertools
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError
from pyproj import Transformer
from shapely.geometry import box, shape

from itza_science.api import boundaries
from itza_science.api.boundaries import (
    BoundaryRequest,
    NoFieldFoundError,
    grow_region,
    pixel_of,
    polygonize,
    propose,
    sample_windows,
)
from itza_science.contracts.common_schema import Period
from itza_science.terrain.grid import Grid
from itza_science.terrain.service import SpatialService
from tests.boundary_support import CENTER, FIELDS, LandscapeSource

pytestmark = pytest.mark.unit
_AROUND_CENTER = box(CENTER[0] - 0.001, CENTER[1] - 0.001, CENTER[0] + 0.001, CENTER[1] + 0.001)
PERIOD = Period(start=date(2024, 9, 1), end=date(2025, 5, 31))


def _stack(shape: tuple[int, int] = (20, 20), dates: int = 12) -> np.ndarray:
    stack = np.zeros((dates, *shape))
    months = np.arange(dates)
    stack[:, :, :10] = (0.3 + 0.4 * np.sin(months / 2))[:, None, None]
    stack[:, :, 10:] = (0.6 - 0.3 * np.sin(months / 3))[:, None, None]
    return stack


def test_request_validates_range_and_period() -> None:
    with pytest.raises(ValidationError):
        BoundaryRequest(lon=200, lat=10)
    with pytest.raises(ValidationError):
        BoundaryRequest(lon=0, lat=95)
    with pytest.raises(ValidationError):
        BoundaryRequest(lon=0, lat=0, period=Period(start=date(2010, 1, 1), end=date(2020, 1, 1)))
    with pytest.raises(ValidationError):
        BoundaryRequest(lon=0, lat=0, period=Period(start=date(2020, 2, 1), end=date(2020, 1, 1)))


def test_grow_region_stops_at_the_trajectory_change() -> None:
    region, separation, edges = grow_region(_stack(), 10, 3)
    assert region[:, :10].all()
    assert not region[:, 10:].any()
    assert separation > 2.5
    assert edges  # the half-plane field reaches the window border


def test_grow_region_rejects_a_pixel_without_observations() -> None:
    stack = _stack()
    stack[:, 4:7, 4:7] = np.nan
    with pytest.raises(NoFieldFoundError, match="few clear"):
        grow_region(stack, 5, 5)


def test_grow_region_rejects_an_isolated_pixel() -> None:
    stack = _stack()
    stack[:, 5, 5] = 0.95
    with pytest.raises(NoFieldFoundError, match="coherent"):
        grow_region(stack, 5, 5)


def test_polygonize_outlines_the_largest_region_without_holes() -> None:
    grid = Grid.for_field(_AROUND_CENTER)
    region = np.zeros(grid.shape, dtype=bool)
    region[5:15, 5:15] = True
    region[8:10, 8:10] = False
    region[20, 20] = True
    outline = polygonize(region, grid)
    assert outline.geom_type == "Polygon"
    assert not list(outline.interiors)
    assert outline.area > 0.8 * 10 * 10 * 900


def test_polygonize_rejects_an_empty_region() -> None:
    grid = Grid.for_field(_AROUND_CENTER)
    with pytest.raises(NoFieldFoundError):
        polygonize(np.zeros(grid.shape, dtype=bool), grid)


@pytest.mark.anyio
async def test_propose_returns_the_field_with_provenance(tmp_path: Path) -> None:
    service = SpatialService(tmp_path, LandscapeSource())
    lon, lat = FIELDS["summer-b"].centroid.x, FIELDS["summer-b"].centroid.y
    result = await propose(service, lon, lat, PERIOD)
    truth = FIELDS["summer-b"]
    outline = shape(result.geometry)
    assert outline.intersection(truth).area / outline.union(truth).area > 0.85
    assert result.sources[0].resolution_m == 30
    assert 10 <= result.dates_used <= len(sample_windows(PERIOD))
    assert result.confidence in {"high", "medium"}
    assert 6 < result.area_ha < 14  # the fixture field is about 9 ha


@pytest.mark.anyio
async def test_propose_rejects_too_few_dates(tmp_path: Path) -> None:
    service = SpatialService(tmp_path, LandscapeSource(limit=3))
    with pytest.raises(NoFieldFoundError, match="too few"):
        await propose(service, *CENTER, PERIOD)


@pytest.mark.anyio
async def test_propose_rejects_a_click_on_the_bare_track(tmp_path: Path) -> None:
    service = SpatialService(tmp_path, LandscapeSource())
    with pytest.raises(NoFieldFoundError):
        await propose(service, CENTER[0], CENTER[1] + 0.0017, PERIOD)


def test_timeout_constant_is_bounded() -> None:
    assert 0 < boundaries.JOB_TIMEOUT_S <= 3600
    assert asyncio.iscoroutinefunction(boundaries.propose)


def test_pixel_of_rejects_points_just_outside_the_window() -> None:
    grid = Grid.for_field(_AROUND_CENTER, buffer_m=boundaries.WINDOW_M)
    west, north = grid.affine.c, grid.affine.f
    to_lonlat = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)
    inside = to_lonlat.transform(west + 15, north - 15)
    assert pixel_of(grid, *inside) == (0, 0)
    # Half a pixel west of the window: int() truncation used to map this to column 0.
    outside = to_lonlat.transform(west - 15, north - 15)
    with pytest.raises(NoFieldFoundError):
        pixel_of(grid, *outside)


def test_sample_windows_cover_the_period_in_short_even_steps() -> None:
    windows = sample_windows(PERIOD)
    assert len(windows) <= boundaries.MAX_PERIOD_DAYS // boundaries.SAMPLE_STEP_DAYS + 1
    assert windows[0].start == PERIOD.start
    assert all((w.end - w.start).days < boundaries.SAMPLE_WINDOW_DAYS for w in windows)
    assert all(
        (b.start - a.start).days == boundaries.SAMPLE_STEP_DAYS
        for a, b in itertools.pairwise(windows)
    )
    assert windows[-1].end <= PERIOD.end


def test_sample_windows_cut_the_last_window_at_the_period_end() -> None:
    short = Period(start=date(2025, 1, 1), end=date(2025, 1, 12))
    windows = sample_windows(short)
    assert [(w.start.day, w.end.day) for w in windows] == [(1, 3), (11, 12)]


@pytest.mark.anyio
async def test_propose_reads_only_the_sampled_windows(tmp_path: Path) -> None:
    source = LandscapeSource()
    service = SpatialService(tmp_path, source)
    centroid = FIELDS["cereal-a"].centroid
    await propose(service, centroid.x, centroid.y, PERIOD)
    assert source.calls == sample_windows(PERIOD)


def test_job_id_is_stable_for_the_same_click_and_period_and_differs_otherwise() -> None:
    a = boundaries.job_id(5.33, 36.12, PERIOD)
    assert a == boundaries.job_id(5.33, 36.12, PERIOD)
    assert a == boundaries.job_id(5.330001, 36.120001, PERIOD)  # within about 10 m
    assert a != boundaries.job_id(5.34, 36.12, PERIOD)
    assert a != boundaries.job_id(5.33, 36.12, Period(start=PERIOD.start, end=date(2025, 6, 1)))
    assert len(a) == 16


def test_store_drops_the_oldest_finished_job_first_and_refuses_when_all_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(boundaries, "MAX_JOBS", 2)
    store = boundaries.BoundaryJobs()
    progress = boundaries.JobProgress(done=0, total=0)
    store.jobs["a"] = boundaries.BoundaryJob(id="a", status="done", progress=progress)
    store.jobs["b"] = boundaries.BoundaryJob(id="b", status="running", progress=progress)
    assert store.make_room()
    assert list(store.jobs) == ["b"]
    store.jobs["c"] = boundaries.BoundaryJob(id="c", status="running", progress=progress)
    assert not store.make_room()
