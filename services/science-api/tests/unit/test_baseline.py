import json
from pathlib import Path

import pytest

from itza_science.clients.baseline import BaselineRecord, BaselineStore, cell_center
from itza_science.core.errors import UpstreamError

pytestmark = pytest.mark.unit


def test_cell_center_snaps_to_quarter_degree_grid() -> None:
    assert cell_center(40.15, -103.15) == (40.125, -103.125)
    assert cell_center(36.19, 5.41) == (36.125, 5.375)
    assert cell_center(0.0, 0.0) == (0.125, 0.125)


def _record(lat: float, lon: float) -> dict[str, object]:
    return {
        "version": "t1",
        "cell_lat": lat,
        "cell_lon": lon,
        "models": {"gfdl_esm4": {"baseline": {"tmax": [1.0] * 12}}},
    }


def _write(root: Path, name: str, text: str) -> None:
    folder = root / "baselines" / "projection"
    folder.mkdir(parents=True)
    (folder / name).write_text(text)


def test_load_returns_none_when_cell_missing(tmp_path: Path) -> None:
    assert BaselineStore(tmp_path).load(40.125, -103.125) is None


def test_load_reads_record(tmp_path: Path) -> None:
    _write(tmp_path, "40.125_-103.125.json", json.dumps(_record(40.125, -103.125)))
    record = BaselineStore(tmp_path).load(40.125, -103.125)
    assert record is not None
    assert record.models["gfdl_esm4"].baseline["tmax"] == [1.0] * 12
    assert record.models["gfdl_esm4"].future == {}


@pytest.mark.parametrize("text", ["{broken", '{"version": "t1"}'])
def test_load_rejects_invalid_record(tmp_path: Path, text: str) -> None:
    _write(tmp_path, "40.125_-103.125.json", text)
    with pytest.raises(UpstreamError, match="invalid"):
        BaselineStore(tmp_path).load(40.125, -103.125)


def test_load_falls_back_to_the_dataset_store(tmp_path: Path) -> None:
    store = tmp_path / "store"
    folder = store / "derived" / "nex-gddp-cmip6" / "v1"
    folder.mkdir(parents=True)
    (folder / "36.125_5.625.json").write_text(json.dumps(_record(36.125, 5.625)))
    record = BaselineStore(tmp_path / "data", store).load(36.125, 5.625)
    assert record is not None
    assert record.cell_lon == 5.625
    assert BaselineStore(tmp_path / "data", store).load(40.125, -103.125) is None


def test_local_record_wins_over_the_store(tmp_path: Path) -> None:
    _write(
        tmp_path, "36.125_5.625.json", json.dumps({**_record(36.125, 5.625), "version": "local"})
    )
    store = tmp_path / "store" / "derived" / "nex-gddp-cmip6" / "v1"
    store.mkdir(parents=True)
    (store / "36.125_5.625.json").write_text(json.dumps(_record(36.125, 5.625)))
    record = BaselineStore(tmp_path, tmp_path / "store").load(36.125, 5.625)
    assert record is not None
    assert record.version == "local"


def test_load_keeps_recorded_archive_gaps(tmp_path: Path) -> None:
    record = {**_record(40.125, -103.125), "gaps": ["cesm2 tmax: not published"]}
    _write(tmp_path, "40.125_-103.125.json", json.dumps(record))
    loaded = BaselineStore(tmp_path).load(40.125, -103.125)
    assert loaded is not None
    assert loaded.gaps == ["cesm2 tmax: not published"]
    # Records written before gaps existed still load.
    assert BaselineRecord.model_validate(_record(1.0, 1.0)).gaps == []
