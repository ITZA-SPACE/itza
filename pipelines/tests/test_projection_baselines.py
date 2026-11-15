import json
from pathlib import Path

import h5py
import numpy as np
import pytest

import projection_baselines as pb


def test_month_lengths_follow_the_model_calendar() -> None:
    assert pb.month_lengths(360) == (30,) * 12
    assert sum(pb.month_lengths(365)) == 365
    assert pb.month_lengths(366)[1] == 29
    with pytest.raises(ValueError):
        pb.month_lengths(300)


def test_monthly_means_split_a_year_into_calendar_months() -> None:
    year = [float(m) for m, n in enumerate(pb.month_lengths(365)) for _ in range(n)]
    assert pb.monthly_means(year) == [float(m) for m in range(12)]


def test_pick_key_prefers_the_corrected_release() -> None:
    keys = ["a/tas_1995.nc", "a/tas_1995_v2.0.nc", "a/tas_1996.nc"]
    assert pb.pick_key(keys, 1995) == "a/tas_1995_v2.0.nc"
    assert pb.pick_key(keys, 1996) == "a/tas_1996.nc"
    with pytest.raises(LookupError):
        pb.pick_key(keys, 2000)


def test_tasks_cover_baseline_and_every_ssp() -> None:
    todo = pb.tasks(["cesm2"], ["tmax"])
    assert len(todo) == 20 + 3 * 20
    assert {t.experiment for t in todo} == {"historical", *pb.SSPS}


def test_read_points_converts_units_and_wraps_longitude(tmp_path: Path) -> None:
    path = tmp_path / "pr.nc"
    with h5py.File(path, "w") as f:
        f["lat"] = np.array([36.125, 40.125])
        f["lon"] = np.array([5.625, 256.875])
        f["pr"] = np.full((365, 2, 2), 1e-5)
    out = pb.read_points(path, "precip", [(40.125, -103.125)])
    assert out[(40.125, -103.125)][0] == pytest.approx(0.864)


def test_assemble_builds_valid_complete_records() -> None:
    cell = (36.125, 5.625)
    months = [1.0] * 12
    results = []
    for model in pb.MODELS:
        for exp in ("historical", *pb.SSPS):
            for year in (1, 2):
                results.append((pb.Task(model, exp, "tmax", year), {cell: months}))
    records = pb.assemble(results, [cell])
    assert records[cell]["models"]["cesm2"]["baseline"]["tmax"] == months
    assert pb.complete(records, 1) == []
    assert pb.complete(records, 2)


def test_hero_cells_are_distinct_quarter_degree_centres() -> None:
    cells = pb.hero_cells()
    assert cells and len(cells) == len(set(cells))
    assert all((c[0] * 8) % 2 == 1 for c in cells)


class _Body:
    def __init__(self, text: str) -> None:
        self._text = text.encode()

    def __enter__(self) -> "_Body":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def read(self) -> bytes:
        return self._text


def test_list_keys_follows_continuation_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    pages = iter(
        [
            "<Key>k1</Key><NextContinuationToken>t/1</NextContinuationToken>",
            "<Key>k2</Key>",
        ]
    )
    seen: list[str] = []

    def fake(url: str, timeout: int) -> _Body:
        seen.append(url)
        return _Body(next(pages))

    monkeypatch.setattr("urllib.request.urlopen", fake)
    assert pb.list_keys("cesm2", "historical", "tmax") == ["k1", "k2"]
    assert "CESM2/historical/r4i1p1f1/tasmax/" in seen[0]
    assert "continuation-token=t%2F1" in seen[1]


def _write_tas(path: Path) -> None:
    with h5py.File(path, "w") as f:
        f["lat"] = np.array([36.125])
        f["lon"] = np.array([5.625])
        f["tas"] = np.full((365, 1, 1), 283.15)


def test_run_task_downloads_reads_and_deletes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("urllib.request.urlretrieve", lambda url, target: _write_tas(target))
    task = pb.Task("cesm2", "historical", "tmean", 1995)
    _, months = pb.run_task(task, "x/tas_1995.nc", [(36.125, 5.625)], tmp_path)
    assert months[(36.125, 5.625)] == pytest.approx([10.0] * 12)
    assert not list(tmp_path.iterdir())


def test_main_writes_one_record_per_cell(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pb, "hero_cells", lambda: [(36.125, 5.625)])
    monkeypatch.setattr(pb, "list_keys", lambda m, e, v: [f"x_{y}.nc" for y in range(1990, 2070)])

    def fake_run(
        task: pb.Task, key: str, cells: list[tuple[float, float]], workdir: Path
    ) -> object:
        return task, {cells[0]: [1.0] * 12}

    monkeypatch.setattr(pb, "run_task", fake_run)
    out = tmp_path / "out"
    monkeypatch.setattr(
        "sys.argv", ["x", "--out", str(out), "--workers", "2", "--variables", "tmax"]
    )
    pb.main()
    written = list(out.iterdir())
    assert [p.name for p in written] == ["36.125_5.625.json"]


def test_main_refuses_incomplete_records(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pb, "hero_cells", lambda: [(36.125, 5.625)])
    monkeypatch.setattr(pb, "list_keys", lambda m, e, v: [f"x_{y}.nc" for y in range(1990, 2070)])
    monkeypatch.setattr(pb, "run_task", lambda t, k, c, w: (t, {c[0]: [1.0] * 12}))
    monkeypatch.setattr(
        "sys.argv",
        ["x", "--out", str(tmp_path), "--models", "cesm2", "--variables", "tmax"],
    )
    with pytest.raises(SystemExit):
        pb.main()


def test_absent_pairs_are_skipped_everywhere_and_recorded() -> None:
    keys = {
        ("cesm2", "historical", "tmax"): [],
        ("cesm2", "ssp126", "tmax"): ["x_2041.nc"],
        ("cesm2", "historical", "tmean"): ["x_1995.nc"],
    }
    absent = pb.absent_pairs(keys)
    assert absent == frozenset({("cesm2", "tmax")})
    todo = pb.tasks(["cesm2"], ["tmax", "tmean"], absent)
    assert {t.variable for t in todo} == {"tmean"}
    cell = (36.125, 5.625)
    results = [
        (pb.Task(model, exp, var, 1), {cell: [1.0] * 12})
        for model in pb.MODELS
        for exp in ("historical", *pb.SSPS)
        for var in ("tmax", "tmean")
        if not (model == "cesm2" and var == "tmax")
    ]
    records = pb.assemble(results, [cell], absent)
    assert records[cell]["gaps"] == ["cesm2 tmax: not published in NEX-GDDP-CMIP6 v2.0"]
    assert "tmax" not in records[cell]["models"]["cesm2"]["baseline"]
    assert pb.complete(records, 2, absent) == []
    # Without the recorded gap the same record is incomplete.
    assert pb.complete(records, 2)


def test_main_records_an_unpublished_variable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(pb, "hero_cells", lambda: [(36.125, 5.625)])

    def listing(model: str, experiment: str, variable: str) -> list[str]:
        if model == "cesm2" and variable == "tmax":
            return []
        return [f"x_{y}.nc" for y in range(1990, 2070)]

    monkeypatch.setattr(pb, "list_keys", listing)
    monkeypatch.setattr(pb, "run_task", lambda t, k, c, w: (t, {c[0]: [1.0] * 12}))
    out = tmp_path / "out"
    monkeypatch.setattr("sys.argv", ["x", "--out", str(out), "--variables", "tmax", "tmean"])
    pb.main()
    record = json.loads((out / "36.125_5.625.json").read_text())
    assert record["gaps"] == ["cesm2 tmax: not published in NEX-GDDP-CMIP6 v2.0"]
    assert set(record["models"]["cesm2"]["baseline"]) == {"tmean"}
    assert set(record["models"]["gfdl_esm4"]["baseline"]) == {"tmax", "tmean"}
