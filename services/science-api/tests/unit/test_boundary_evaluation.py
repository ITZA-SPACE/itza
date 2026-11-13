from dataclasses import replace

import pytest
from shapely.geometry import Point, Polygon, box

from itza_science.geo.evaluation import acceptance_rate, classify, iou, sample_clicks

pytestmark = pytest.mark.unit
FIELD = box(0, 0, 10, 10)


def test_iou_of_identical_overlapping_and_disjoint_outlines() -> None:
    assert iou(FIELD, FIELD) == 1.0
    assert iou(box(0, 0, 10, 5), FIELD) == pytest.approx(0.5)
    assert iou(box(20, 20, 30, 30), FIELD) == 0.0
    assert iou(Polygon(), Polygon()) == 0.0


def test_sample_clicks_stay_inside_and_away_from_the_edges() -> None:
    clicks = sample_clicks(FIELD, 3)
    assert len(clicks) == 9
    assert all(2 <= x <= 8 and 2 <= y <= 8 for x, y in clicks)


def test_sample_clicks_drop_points_outside_a_concave_outline() -> None:
    ell = Polygon([(0, 0), (10, 0), (10, 3), (3, 3), (3, 10), (0, 10)])
    clicks = sample_clicks(ell, 5, inset=0.0)
    assert clicks
    assert all(ell.contains(Point(c)) for c in clicks)
    assert len(clicks) < 25


@pytest.mark.parametrize(("per_side", "inset"), [(0, 0.2), (3, -0.1), (3, 0.5)])
def test_sample_clicks_reject_bad_arguments(per_side: int, inset: float) -> None:
    with pytest.raises(ValueError, match="per_side"):
        sample_clicks(FIELD, per_side, inset)


def test_classify_applies_the_threshold() -> None:
    click = (5.0, 5.0)
    assert classify("a", click, box(0, 0, 10, 9), FIELD, 0.85).outcome == "accepted"
    rejected = classify("a", click, box(0, 0, 10, 5), FIELD, 0.85)
    assert rejected.outcome == "rejected"
    assert rejected.iou == pytest.approx(0.5)


def test_classify_marks_a_missing_proposal() -> None:
    result = classify("a", (1.0, 2.0), None, FIELD, 0.85)
    assert (result.outcome, result.iou, result.reason) == ("no_proposal", None, None)
    assert replace(result, reason="too uniform").reason == "too uniform"


def test_acceptance_rate_counts_missing_proposals_as_misses() -> None:
    click = (5.0, 5.0)
    results = [
        classify("a", click, FIELD, FIELD, 0.85),
        classify("a", click, None, FIELD, 0.85),
        classify("a", click, box(0, 0, 10, 5), FIELD, 0.85),
        classify("a", click, box(0, 0, 10, 10), FIELD, 0.85),
    ]
    assert acceptance_rate(results) == 0.5
    assert acceptance_rate([]) == 0.0
