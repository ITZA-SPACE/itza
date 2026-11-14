"""Offline calculation and source-to-artifact checks. No requests or service credentials."""

from __future__ import annotations

import copy
import csv
import io
import itertools
import json
import sys
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parent))
from build import HERE, Capture, build, correlation, monthly_daily, ranks, seasons, statistics
from capture import parse_quickstats


def test_rank_ties_and_reverse_direction() -> None:
    assert ranks([4, 1, 1, 9]) == [3, 1.5, 1.5, 4]
    assert correlation([1, 2, 3], [30, 20, 10]) == pytest.approx(-1)
    assert correlation([1, 2, 3], [10, 20, 30]) == pytest.approx(1)
    assert correlation([1, 1, 1], [1, 2, 3]) is None
    assert correlation([1, 2], [1, 2]) is None


def test_water_errors_and_direction_do_not_compare_unlike_units() -> None:
    rows: list[dict[str, str | float]] = [
        {"period": "2020", "itza": 10.0, "reference": 8.0},
        {"period": "2021", "itza": 12.0, "reference": 7.0},
        {"period": "2023", "itza": 14.0, "reference": 9.0},
        {"period": "2024", "itza": 14.0, "reference": 9.0},
    ]
    water = statistics(rows, directional=False)
    assert water["bias"] == pytest.approx(4.25)
    assert water["rmse"] == pytest.approx((79 / 4) ** 0.5)
    context = statistics(rows, directional=True)
    assert context["bias"] is context["rmse"] is None
    assert context["direction_agree"] == 0
    assert context["direction_n"] == 1  # missing 2022 not bridged
    assert context["direction_ties"] == 1
    assert statistics([], directional=False)["bias"] is None


def test_full_months_and_full_seasons_only() -> None:
    assert monthly_daily("2020-02-01", [1.0] * 29) == {"2020-02": 29}
    assert monthly_daily("2020-02-01", [1.0] * 28) == {}
    assert monthly_daily("2020-02-02", [1.0] * 29) == {}
    assert monthly_daily("2020-02-01", [None] + [1.0] * 28) == {}
    months = {f"{2020 + i // 12}-{i % 12 + 1:02}": 1.0 for i in range(24)}
    assert seasons(months, 9) == {"2021": 12}
    del months["2021-02"]
    assert seasons(months, 9) == {}


@pytest.mark.parametrize(
    "change",
    [
        {"unit": "in"},
        {"status": "unavailable"},
        {"observations": [{"period": "2020-13", "value": 1}]},
        {"observations": [{"period": "2020-01", "value": float("nan")}]},
        {"observations": [{"period": "2020-01", "value": -1}]},
        {"observations": [{"period": "2020", "value": 1}]},
        {"observations": [{"period": "2020-01", "value": 1}] * 2},
    ],
)
def test_capture_rejects_bad_units_periods_values_and_status(change: dict[str, object]) -> None:
    data = json.loads((HERE / "data/akron-proof-1-prism.json").read_text())
    data.update(change)
    with pytest.raises(ValidationError):
        Capture.model_validate(data)


def test_quickstats_filters_subsets_and_preserves_suppression() -> None:
    raw = (HERE / "data/raw/quickstats.csv").read_text()
    rows = list(csv.DictReader(io.StringIO(raw)))
    expected = parse_quickstats(raw)
    excluded = copy.deepcopy(rows[0])
    excluded["Data Item"] += ", NON-IRRIGATED"
    suppressed = copy.deepcopy(rows[0])
    suppressed["Year"], suppressed["Value"] = "2024", "(D)"
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows([*rows, excluded, suppressed])
    actual = parse_quickstats(out.getvalue())
    assert len(actual) == len(expected) + 1
    assert next(r for r in actual if r.period == "2024").value is None


@pytest.mark.integration
def test_captured_sources_to_offline_artifact() -> None:
    result = build()
    assert len(result["fields"]) == 3
    for field in result["fields"]:
        checks = {c["kind"]: c for c in field["checks"]}
        assert set(checks) == {"prism", "openet", "quickstats"}
        # The current captures cannot substantiate two requested comparisons.
        assert checks["prism"]["reason"] == "missing_imerg"
        assert checks["prism"]["statistics"]["n"] == 0
        assert checks["openet"]["reason"] == "openet_key_required"
        assert checks["openet"]["statistics"]["n"] == 0
        county = checks["quickstats"]
        assert county["statistics"]["n"] == 15
        assert county["statistics"]["bias"] is None
        assert county["statistics"]["rmse"] is None
        assert county["statistics"]["spearman"] == pytest.approx(
            0.59696181120556 if field["id"].endswith("1") else 0.5915998787695819
        )
        assert county["statistics"]["direction_n"] == 12


def test_ranking_invariants_over_permutations() -> None:
    for ordering in itertools.permutations([0.0, 1.0, 1.0, 4.0]):
        x = list(ordering)
        assert correlation(x, [v * 7 + 13 for v in x]) == pytest.approx(1)
        assert correlation(x, [-v for v in x]) == pytest.approx(-1)
        assert sum(ranks(x)) == 10


def test_ready_water_comparisons_and_stale_replay(tmp_path: Path, monkeypatch: Any) -> None:
    import shutil

    import build as module

    data_dir = tmp_path / "validation"
    shutil.copytree(HERE, data_dir)
    bundle_root = tmp_path / "repo"
    for n in (1, 2, 3):
        field_id = f"akron-proof-{n}"
        target = bundle_root / f"apps/web/public/bundles/{field_id}/bundle.json"
        target.parent.mkdir(parents=True)
        original = module.ROOT / f"apps/web/public/bundles/{field_id}/bundle.json"
        bundle = json.loads(original.read_text())
        rain = next(s for s in bundle["series"] if s["var"] == "precip")
        rain["provenance"]["source"] = "gpm_imerg_final_daily"
        target.write_text(json.dumps(bundle))
        replay_path = data_dir / "data/replay.json"
        replay = json.loads(replay_path.read_text())
        replay["fields"][n - 1]["bundle_sha256"] = module.sha(target)
        replay_path.write_text(json.dumps(replay))
        et_path = data_dir / f"data/{field_id}-openet.json"
        et = json.loads(et_path.read_text())
        et.update(
            status="ready",
            reason=None,
            observations=[{"period": f"2009-{m:02}", "value": float(m)} for m in range(1, 13)],
        )
        et_path.write_text(json.dumps(et))
    monkeypatch.setattr(module, "HERE", data_dir)
    monkeypatch.setattr(module, "ROOT", bundle_root)
    fields = module.build()["fields"]
    for field in fields:
        rain, et = field["checks"][:2]
        assert rain["status"] == et["status"] == "ready"
        assert rain["statistics"]["n"] == 17
        assert et["statistics"]["n"] == 12
        assert rain["statistics"]["bias"] is not None
        assert et["statistics"]["rmse"] is not None
    target.write_text("{}")
    with pytest.raises(ValueError, match="stale replay"):
        module.build()
