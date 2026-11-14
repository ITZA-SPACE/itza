from dataclasses import replace

import pytest
from shapely.geometry import Point, Polygon, box

from itza_science.geo.evaluation import (
    ClickResult,
    ReferenceError,
    acceptance_rate,
    check_field_count,
    classify,
    dump_result,
    iou,
    load_results,
    parse_references,
    render_report,
    result_key,
    sample_clicks,
    summarize,
    worst_fields,
)

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


def _feature(name: str, **props: object) -> dict[str, object]:
    base = {"name": name, "imagery": "EOX Sentinel-2 cloudless 2016", "date": "2016-06-01"}
    return {
        "type": "Feature",
        "properties": {**base, **props},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[5, 36], [5.01, 36], [5.01, 36.01], [5, 36]]],
        },
    }


def _collection(*features: dict[str, object], **extra: object) -> dict[str, object]:
    return {"type": "FeatureCollection", "features": list(features), **extra}


def test_parse_references_reads_outlines_imagery_and_region() -> None:
    parsed = parse_references(_collection(_feature("a"), _feature("b"), region="Setif"), "file")
    assert parsed.region == "Setif"
    assert list(parsed.outlines) == ["a", "b"]
    assert parsed.imagery["a"] == "EOX Sentinel-2 cloudless 2016"
    assert parsed.drawn_on["b"] == "2016-06-01"
    assert parse_references(_collection(_feature("a")), "file").region == "file"


@pytest.mark.parametrize(
    ("collection", "message"),
    [
        ({"type": "Feature"}, "FeatureCollection"),
        (_collection(), "FeatureCollection"),
        (_collection(_feature("")), "needs a name"),
        (_collection(_feature("a"), _feature("a")), "duplicate"),
        (_collection(_feature("a", imagery="")), "imagery"),
        (_collection(_feature("a", date="June 2016")), "YYYY-MM-DD"),
        (_collection(_feature("a", date=None)), "YYYY-MM-DD"),
        (
            _collection(
                {
                    **_feature("a"),
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
                    },
                }
            ),
            "not a valid Polygon",
        ),
        (
            _collection(
                {**_feature("a"), "geometry": {"type": "Point", "coordinates": [5, 36]}},
            ),
            "not a valid Polygon",
        ),
        (
            _collection(
                {
                    **_feature("a"),
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[190, 36], [191, 36], [191, 37], [190, 36]]],
                    },
                }
            ),
            "outside longitude",
        ),
    ],
)
def test_parse_references_rejects_unusable_files(
    collection: dict[str, object], message: str
) -> None:
    with pytest.raises(ReferenceError, match=message):
        parse_references(collection, "file")


def test_check_field_count_wants_enough_outlines() -> None:
    few = parse_references(_collection(_feature("a"), _feature("b")), "file")
    check_field_count(few, 2)
    with pytest.raises(ReferenceError, match="at least 3"):
        check_field_count(few, 3)


def _results() -> list[ClickResult]:
    click = (5.0, 5.0)
    return [
        classify("a", click, FIELD, FIELD, 0.85),
        classify("a", click, box(0, 0, 10, 9), FIELD, 0.85),
        classify("a", click, box(0, 0, 10, 5), FIELD, 0.85),
        replace(classify("b", click, None, FIELD, 0.85), kind="no-field", reason="uniform"),
        replace(classify("b", click, None, FIELD, 0.85), kind="timeout"),
        classify("b", click, None, FIELD, 0.85),
    ]


def test_summarize_counts_outcomes_refusals_and_the_iou_spread() -> None:
    summary = summarize("Setif", _results())
    assert (summary.fields, summary.clicks, summary.accepted, summary.rejected) == (2, 6, 2, 1)
    # A refusal without a kind counts as unavailable, so nothing goes uncounted.
    assert summary.refused == {"no-field": 1, "timeout": 1, "unavailable": 1}
    assert summary.share == pytest.approx(2 / 6)
    assert summary.iou is not None
    assert summary.iou.minimum == pytest.approx(0.5)
    assert summary.iou.maximum == 1.0
    assert 0.5 < summary.iou.median < 1.0


def test_summarize_of_nothing_is_empty() -> None:
    summary = summarize("none", [])
    assert (summary.clicks, summary.share, summary.iou) == (0, 0.0, None)


def test_worst_fields_ranks_by_accepted_share() -> None:
    assert worst_fields(_results(), 1) == [("b", 0.0)]
    assert [name for name, _ in worst_fields(_results())] == ["b", "a"]


def test_render_report_has_a_row_per_region_and_a_verdict() -> None:
    good = summarize("Akron", [classify("a", (5.0, 5.0), FIELD, FIELD, 0.85)] * 4)
    bad = summarize("Setif", _results())
    report = render_report([good, bad], 0.85)
    assert "| Akron | 1 | 4 | 4 (100%) |" in report
    assert "| Setif | 2 | 6 | 2 (33%) | 1 | 1 | 1 | 1 |" in report
    assert "Akron meets the 70% target" in report
    assert "Setif misses the 70% target" in report
    assert "n/a" in render_report([summarize("x", [])], 0.85)


def test_results_round_trip_through_json_lines_for_resuming() -> None:
    results = _results()
    text = "\n".join(dump_result(r) for r in results) + "\n\n"
    assert load_results(text) == results
    assert result_key(results[0]) == ("a", 5.0, 5.0)
