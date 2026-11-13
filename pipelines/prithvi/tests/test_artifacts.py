"""Guard scientific provenance and the published API/static artifact agreement."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
import rasterio

from contracts import Dataset, HeroChip

pytestmark = pytest.mark.unit
ROOT = Path(__file__).resolve().parents[3]


def test_validation_report_retains_exact_source_manifest() -> None:
    directory = ROOT / "pipelines/prithvi/artifacts"
    report = json.loads((directory / "metrics.json").read_text())
    raw = (directory / "data-manifest.json").read_bytes()
    dataset = Dataset.model_validate_json(raw)
    assert hashlib.sha256(raw).hexdigest() == report["data_manifest_sha256"]
    assert len([c for c in dataset.chips if c.split == "train"]) == report["training_chips"]
    assert len([c for c in dataset.chips if c.split == "held_out"]) == report["held_out_chips"]
    assert report["minimum_train_holdout_gap_m"] >= 10_000
    assert report["metrics"]["pixels"] == sum(
        sum(row) for row in report["metrics"]["confusion_matrix_true_rows"]
    )
    assert report["metrics"]["iou_fallow"] == 0  # Published failed experiment must stay explicit.


@pytest.mark.parametrize("name", ["setif-story", "akron-proof-1", "akron-proof-2", "akron-proof-3"])
def test_hero_sources_and_publication_integrity(name: str) -> None:
    pipeline = ROOT / "pipelines/prithvi"
    report = json.loads((pipeline / "artifacts/metrics.json").read_text())
    api = ROOT / "services/science-api/models/prithvi" / name
    static = ROOT / "apps/web/public/bundles" / name
    manifest = json.loads((api / "prithvi.json").read_text())
    assert manifest["status"] == "experimental"
    assert manifest["checkpoint_sha256"] == report["checkpoint_sha256"]
    assert (api / "prithvi.json").read_bytes() == (static / "prithvi.json").read_bytes()
    expected_rasters = {season["file"] for season in manifest["seasons"]}
    assert {path.name for path in api.glob("prithvi-*.tif")} == expected_rasters
    assert {path.name for path in static.glob("prithvi-*.tif")} == expected_rasters
    for season in manifest["seasons"]:
        path = pipeline / "data/heroes" / f"{name}-{season['year']}.npz"
        source = HeroChip.model_validate_json(path.with_suffix(".json").read_bytes())
        assert source.bundle_id == name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source.chip_sha256
        with np.load(path, allow_pickle=False) as chip:
            assert chip["raw"].shape == (18, 64, 64)
            assert chip["invalid"].shape == (64, 64)
        payload = (api / season["file"]).read_bytes()
        assert len(payload) <= 150_000
        assert hashlib.sha256(payload).hexdigest() == season["sha256"]
        assert payload == (static / season["file"]).read_bytes()
        with rasterio.MemoryFile(payload) as memory, memory.open() as raster:
            assert raster.res == (30, 30)
            assert np.isin(raster.read(1), [0, 1, 2]).all()
    record = json.loads((static / "provenance.json").read_text())
    for file, digest in record["files"].items():
        assert hashlib.sha256((static / file).read_bytes()).hexdigest() == digest
    assert sum(file.stat().st_size for file in static.rglob("*") if file.is_file()) <= 5_000_000
