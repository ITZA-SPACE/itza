import numpy as np
import pytest
from shapely.geometry import box

from itza_science.geo.clip import Grid, area_weighted_mean

pytestmark = pytest.mark.unit


def test_from_centers_builds_north_up_grid() -> None:
    grid = Grid.from_centers(np.array([0.0, 1.0, 2.0]), np.array([10.0, 9.0, 8.0]))
    assert grid.n_rows == 3
    assert grid.n_cols == 3
    assert grid.cell_bounds(0, 0) == (-0.5, 9.5, 0.5, 10.5)


def test_mean_inside_one_cell() -> None:
    grid = Grid(lon_min=0.0, lat_max=2.0, dlon=1.0, dlat=1.0, n_rows=2, n_cols=2)
    values = np.array([[1.0, 2.0], [3.0, 4.0]])
    invalid = np.zeros((2, 2), dtype=bool)
    field = box(0.2, 1.2, 0.4, 1.4)  # fully inside the top-left cell (lat 1..2, value 1.0)
    result = area_weighted_mean(grid, values, invalid, field)
    assert result.mean == pytest.approx(1.0)
    assert result.coverage == pytest.approx(1.0)


def test_mean_spans_two_cells_weighted_by_overlap() -> None:
    grid = Grid(lon_min=0.0, lat_max=1.0, dlon=1.0, dlat=1.0, n_rows=1, n_cols=2)
    values = np.array([[0.0, 10.0]])
    invalid = np.zeros((1, 2), dtype=bool)
    # 0.25 wide inside the left cell, 0.75 wide inside the right cell.
    field = box(0.75, 0.0, 2.0, 1.0)
    result = area_weighted_mean(grid, values, invalid, field)
    assert result.mean == pytest.approx((0.25 * 0.0 + 1.0 * 10.0) / 1.25)


def test_all_masked_returns_none_mean_and_zero_coverage() -> None:
    grid = Grid(lon_min=0.0, lat_max=1.0, dlon=1.0, dlat=1.0, n_rows=1, n_cols=1)
    values = np.array([[5.0]])
    invalid = np.array([[True]])
    field = box(0.0, 0.0, 1.0, 1.0)
    result = area_weighted_mean(grid, values, invalid, field)
    assert result.mean is None
    assert result.coverage == 0.0


def test_partial_coverage_reported() -> None:
    grid = Grid(lon_min=0.0, lat_max=1.0, dlon=1.0, dlat=1.0, n_rows=1, n_cols=1)
    values = np.array([[5.0]])
    invalid = np.zeros((1, 1), dtype=bool)
    field = box(0.0, 0.0, 2.0, 1.0)  # grid cell covers only half the field
    result = area_weighted_mean(grid, values, invalid, field)
    assert result.mean == pytest.approx(5.0)
    assert result.coverage == pytest.approx(0.5)
