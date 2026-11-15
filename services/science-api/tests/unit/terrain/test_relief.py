from datetime import date
from io import BytesIO

import numpy as np
import pytest
from PIL import Image
from shapely.geometry import Polygon, box

from itza_science.terrain.grid import SpatialLimitError
from itza_science.terrain.models import TerrainIndex
from itza_science.terrain.relief import ReliefGrid, encode_heights

pytestmark = pytest.mark.unit

# akron-proof-1 in pipelines/hero_fields.yaml: a 240 m sampling square.
AKRON_1 = Polygon(
    [
        (-103.17086256247813, 40.16678544374368),
        (-103.16802791867501, 40.166946897345056),
        (-103.16824213938182, 40.169082956355155),
        (-103.17107686725595, 40.168921497752535),
    ]
)
SOURCE = {
    "source": "USGS",
    "product": "3DEP dynamic elevation service",
    "version": "best available",
    "resolution_m": 1,
    "period": {"start": "2020-01-01", "end": "2020-12-31"},
    "method": "test",
    "retrieved": date(2026, 11, 14).isoformat(),
}
RELIEF_JSON = {
    "heightmap": "h.png",
    "imagery": "i.jpg",
    "width": 570,
    "height": 567,
    "bounds": [-103.1729, 40.1654, -103.1662, 40.1705],
    "size_m": [570.0, 567.0],
    "min_elevation_m": 1390.3,
    "max_elevation_m": 1408.7,
    "elevation_source": SOURCE,
    "imagery_source": None,
}


def decode(png: bytes, low: float, high: float) -> np.ndarray:
    rgb = np.asarray(Image.open(BytesIO(png)).convert("RGB")).astype(np.float64)
    return low + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * (high - low)


def test_grid_is_about_one_metre_and_square() -> None:
    grid = ReliefGrid.for_field(AKRON_1)
    assert 540 <= grid.size_m[0] <= 580
    assert 540 <= grid.size_m[1] <= 580
    assert abs(grid.cell_m - 1.0) < 0.05
    assert abs(grid.size_m[0] / grid.width - grid.size_m[1] / grid.height) < 0.02
    west, south, east, north = grid.bounds
    assert west < AKRON_1.bounds[0]
    assert south < AKRON_1.bounds[1]
    assert east > AKRON_1.bounds[2]
    assert north > AKRON_1.bounds[3]


def test_grid_caps_side() -> None:
    grid = ReliefGrid.for_field(box(-103.20, 40.10, -103.14, 40.16))
    assert max(grid.width, grid.height) == 1024
    assert grid.cell_m > 4
    assert abs(grid.size_m[0] / grid.width - grid.size_m[1] / grid.height) < 0.05


def test_grid_rejects_invalid_and_polar_fields() -> None:
    with pytest.raises(SpatialLimitError):
        ReliefGrid.for_field(Polygon())
    with pytest.raises(SpatialLimitError):
        ReliefGrid.for_field(box(10, 88, 10.01, 88.01))


def test_encode_round_trip() -> None:
    z = np.linspace(1390.0, 1408.0, 64 * 48).reshape(48, 64)
    png, low, high, filled = encode_heights(z)
    assert (low, high, filled) == (1390.0, 1408.0, 0)
    assert np.abs(decode(png, low, high) - z).max() < 0.001


def test_encode_fills_nan() -> None:
    z = np.full((8, 8), 100.0)
    z[3, 3] = np.nan
    _, low, high, filled = encode_heights(z)
    assert filled == 1
    assert low == high == 100.0


def test_encode_fills_hole_from_nearest_cell() -> None:
    z = np.tile(np.arange(8, dtype=float), (8, 1))
    z[4, 6] = np.nan
    png, low, high, filled = encode_heights(z)
    back = decode(png, low, high)
    assert filled == 1
    assert back[4, 6] in (
        pytest.approx(5.0, abs=0.01),
        pytest.approx(6.0, abs=0.01),
        pytest.approx(7.0, abs=0.01),
    )


def test_encode_flat() -> None:
    png, low, high, _ = encode_heights(np.full((4, 4), 12.5))
    assert low == high == 12.5
    assert np.asarray(Image.open(BytesIO(png)).convert("RGB")).max() == 0


def test_encode_rejects_all_nan() -> None:
    with pytest.raises(ValueError, match="no valid cell"):
        encode_heights(np.full((4, 4), np.nan))


def test_terrain_index_accepts_relief() -> None:
    index = TerrainIndex.model_validate({"available": True, "relief": RELIEF_JSON})
    assert index.relief is not None
    assert index.relief.width == 570
    assert TerrainIndex.model_validate({"available": True}).relief is None
