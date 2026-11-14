from datetime import date
from io import BytesIO

import numpy as np
import pytest
from affine import Affine
from PIL import Image
from shapely.geometry import Polygon, box

from itza_science.adapters.base import Period
from itza_science.terrain.derivatives import derive, flow_lines
from itza_science.terrain.grid import Grid, SpatialLimitError, project
from itza_science.terrain.images import encode
from itza_science.terrain.models import SoilBaseline
from itza_science.terrain.sources import Inputs, Observation
from itza_science.terrain.zoning import (
    annual_statistics,
    select_k,
    soil_scenario,
    stability_score,
    zones,
)
from tests.spatial_support import FixtureSpatialSource, proof

pytestmark = pytest.mark.unit


def test_plane_slope_aspect_and_d8_conservation() -> None:
    dem = np.tile(np.arange(20, 0, -1, dtype=float) * 3, (20, 1))
    terrain = derive(dem)
    np.testing.assert_allclose(terrain.slope, np.degrees(np.arctan(0.1)))
    np.testing.assert_allclose(terrain.aspect, 90)
    np.testing.assert_allclose(terrain.accumulation, np.tile(np.arange(1, 21), (20, 1)))
    assert (terrain.downstream[:, -1] == -1).all()
    assert (terrain.slope_class == 2).all()


@pytest.mark.parametrize("seed", range(10))
def test_d8_routes_downhill_without_losing_contributing_area(seed: int) -> None:
    dem = np.random.default_rng(seed).normal(size=(15, 20))
    dem[2, 2] = np.nan
    terrain = derive(dem)
    valid = np.isfinite(dem)
    outlets = (terrain.downstream == -1) & valid
    assert terrain.accumulation[outlets].sum() == valid.sum()
    targets = terrain.downstream.ravel()
    routed = targets >= 0
    assert (dem.ravel()[routed] > dem.ravel()[targets[routed]]).all()
    assert np.isnan(terrain.accumulation[2, 2])


def test_pit_and_flat_are_sinks_without_invented_aspect() -> None:
    dem = np.full((9, 9), 100.0)
    dem[4, 4] = 90
    terrain = derive(dem)
    assert terrain.downstream[4, 4] == -1
    assert terrain.concavity[4, 4] < 0
    assert np.isnan(terrain.aspect[0, 0])
    with pytest.raises(ValueError, match="two-dimensional"):
        derive(np.ones((1, 4)))


def test_grid_projection_mask_hole_and_limits() -> None:
    field = box(5.328, 36.118, 5.332, 36.122)
    grid = Grid.for_field(field)
    np.testing.assert_allclose(project(grid.field, grid.crs, "EPSG:4326").bounds, field.bounds)
    assert grid.mask.sum() > 30
    rows, cols = grid.field_window()
    assert rows.stop > rows.start
    assert cols.stop > cols.start
    assert grid.bounds[0] < field.bounds[0]
    with pytest.raises(SpatialLimitError, match="UTM"):
        Grid.for_field(box(1, 86, 2, 87))
    with pytest.raises(SpatialLimitError, match="500000"):
        Grid.for_field(box(1, 1, 5, 5))
    with pytest.raises(SpatialLimitError, match="valid"):
        Grid.for_field(Polygon())
    empty = Grid("EPSG:32631", Affine(30, 0, 0, 0, -30, 30), 2, 2, box(1, 1, 2, 2))
    with pytest.raises(SpatialLimitError, match="pixel center"):
        empty.field_window()


def test_flow_lines_are_clipped_to_field() -> None:
    grid = Grid(
        "EPSG:32631",
        Affine(30, 0, 400000, 0, -30, 4000000),
        20,
        20,
        box(400030, 3999430, 400570, 3999970),
    )
    terrain = derive(np.tile(np.arange(20, 0, -1, dtype=float), (20, 1)))
    result = flow_lines(terrain, grid)
    assert result["features"]
    assert float(str(result["threshold_cells"])) >= 10
    assert not flow_lines(derive(np.ones((20, 20))), grid)["features"]


def test_k_selection_and_stability_are_label_invariant() -> None:
    rng = np.random.default_rng(42)
    matrix = np.concatenate([rng.normal(c, 0.02, (40, 3)) for c in (0, 5, 10)])
    labels, score = select_k(matrix)
    assert len(np.unique(labels)) == 3
    assert score > 0.98
    stability, retained = stability_score(labels, [labels, (labels + 1) % 3])
    assert stability == 1
    assert set(retained.values()) == {1.0}
    shuffled = rng.permutation(labels)
    unstable, _ = stability_score(labels, [labels, shuffled])
    assert unstable is not None
    assert unstable < 0.1
    assert stability_score(labels, [labels])[0] is None
    with pytest.raises(ValueError, match="distinguish"):
        select_k(np.ones((40, 3)))


def test_soil_scenario_preserves_awc_and_increases_runoff_with_slope() -> None:
    baseline = SoilBaseline(awc_mm_per_m=140, curve_number=75, source="caller baseline")
    low = soil_scenario(baseline, 0)
    high = soil_scenario(baseline, 20)
    assert low
    assert high
    assert low.awc_mm_per_m == high.awc_mm_per_m == 140
    assert low.curve_number < 75 < high.curve_number <= 98
    assert high.confidence == "low"
    assert soil_scenario(None, 10) is None
    assert soil_scenario(baseline, None) is None


def test_annual_statistics_gaps_and_peak() -> None:
    frames = [
        Observation(date(2024, 3, 1), np.array([[0.2, np.nan]]), proof(date(2024, 3, 1))),
        Observation(date(2024, 6, 1), np.array([[0.6, np.nan]]), proof(date(2024, 6, 1))),
    ]
    stats = annual_statistics(frames)[2024]
    assert stats["mean"][0, 0] == pytest.approx(0.4)
    assert stats["cv"][0, 0] == pytest.approx(0.5)
    assert np.isnan(stats["mean"][0, 1])
    assert stats["sin"][0, 0] == pytest.approx(np.sin(153 * 2 * np.pi / 366))


@pytest.mark.anyio
async def test_zones_fixture_and_disabled_cases() -> None:
    grid = Grid.for_field(box(5.328, 36.118, 5.332, 36.122))
    source = FixtureSpatialSource()
    inputs = await source.series(grid, Period(date(2024, 1, 1), date(2026, 12, 31)), "test")
    dem = await source.dem(grid)
    terrain = derive(dem.elevation) if dem.elevation is not None else None
    result = zones(grid, inputs, terrain, None)
    assert result.enabled
    assert result.k in (2, 3, 4)
    assert result.stability is not None
    assert result.stability > 0.8
    assert all(f.properties.soil_water is None for f in result.features)
    assert not zones(grid, Inputs(), None, None).enabled
    for observation in inputs.observations:
        observation.values[:] = 0.5
    homogeneous = zones(grid, inputs, None, None)
    assert not homogeneous.enabled
    assert "distinguish" in str(homogeneous.reason)
    for observation in inputs.observations:
        observation.values[:] = np.nan
    assert not zones(grid, inputs, None, None).enabled


@pytest.mark.parametrize(
    "variable", ["ndvi", "moisture", "slope", "aspect", "accumulation", "concavity", "slope_class"]
)
def test_png_budget_and_transparency(variable: str) -> None:
    grid = Grid(
        "EPSG:32631",
        Affine(30, 0, 400000, 0, -30, 4000000),
        700,
        700,
        box(400000, 3979000, 421000, 4000000),
    )
    values = np.random.default_rng(4).uniform(-1, 1, grid.shape)
    values[0, 0] = np.nan
    payload, width, height, bounds = encode(values, grid, variable)
    assert len(payload) <= 150000
    assert width <= 1024
    assert height <= 1024
    image = Image.open(BytesIO(payload))
    assert image.mode == "RGBA"
    assert np.asarray(image)[0, 0, 3] == 0
    assert bounds[0] < bounds[2]
    assert bounds[1] < bounds[3]
