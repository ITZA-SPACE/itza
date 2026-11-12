import asyncio
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError
from shapely.geometry import box, shape

from itza_science.api import boundaries
from itza_science.api.boundaries import (
    BoundaryRequest,
    NoFieldFoundError,
    grow_region,
    polygonize,
    propose,
)
from itza_science.contracts.common_schema import Period
from itza_science.terrain.grid import Grid
from itza_science.terrain.service import SpatialService
from tests.boundary_support import CENTER, FIELDS, LandscapeSource

pytestmark = pytest.mark.unit
_AROUND_CENTER = box(CENTER[0] - 0.001, CENTER[1] - 0.001, CENTER[0] + 0.001, CENTER[1] + 0.001)
PERIOD = Period(start=date(2024, 1, 1), end=date(2025, 12, 31))


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
    assert result.dates_used == 24
    assert result.confidence in {"high", "medium"}
    assert 6 < result.area_ha < 14  # the fixture field is about 9 ha


@pytest.mark.anyio
async def test_propose_rejects_too_few_dates(tmp_path: Path) -> None:
    service = SpatialService(tmp_path, LandscapeSource(months=3))
    with pytest.raises(NoFieldFoundError, match="too few"):
        await propose(service, *CENTER, PERIOD)


@pytest.mark.anyio
async def test_propose_rejects_a_click_on_the_bare_track(tmp_path: Path) -> None:
    service = SpatialService(tmp_path, LandscapeSource())
    with pytest.raises(NoFieldFoundError):
        await propose(service, CENTER[0], CENTER[1] + 0.0017, PERIOD)


def test_timeout_constant_is_bounded() -> None:
    assert 0 < boundaries.TIMEOUT_S <= 120
    assert asyncio.iscoroutinefunction(boundaries.propose)
