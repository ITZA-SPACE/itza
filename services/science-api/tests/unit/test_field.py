import re

import pytest

from itza_science.contracts.field_bundle_schema import Polygon
from itza_science.core.field import area_ha, centroid, field_id, to_shapely

pytestmark = pytest.mark.unit

SQUARE = Polygon(
    type="Polygon",
    coordinates=[
        [
            [5.32804, 36.11842],
            [5.33196, 36.11842],
            [5.33196, 36.12158],
            [5.32804, 36.12158],
            [5.32804, 36.11842],
        ]
    ],
)


def test_field_id_matches_pattern() -> None:
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", field_id(SQUARE))


def test_field_id_is_deterministic() -> None:
    assert field_id(SQUARE) == field_id(SQUARE)


def test_field_id_rounds_to_five_decimals() -> None:
    nudged = SQUARE.model_copy(deep=True)
    nudged.coordinates[0][0] = [5.328041, 36.118421]  # within 1e-5 of the first vertex
    assert field_id(SQUARE) == field_id(nudged)


def test_field_id_differs_for_different_geometry() -> None:
    other = SQUARE.model_copy(deep=True)
    other.coordinates[0][1] = [5.4, 36.11842]
    assert field_id(SQUARE) != field_id(other)


def test_area_ha_matches_known_field_size() -> None:
    assert area_ha(to_shapely(SQUARE)) == pytest.approx(12.4, abs=0.1)


def test_centroid_is_near_the_square_center() -> None:
    lon, lat = centroid(to_shapely(SQUARE))
    assert lon == pytest.approx(5.33, abs=0.001)
    assert lat == pytest.approx(36.12, abs=0.001)
