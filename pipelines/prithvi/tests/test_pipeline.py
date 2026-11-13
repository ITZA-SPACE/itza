import hashlib
import io
import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio
import torch
from pydantic import ValidationError
from rasterio.transform import from_origin
from test_model import FakeSegmenter

import capture
import hero
import train
from contracts import Dataset, HeroChip

pytestmark = pytest.mark.unit


def make_tiff(path: Path, array: Any) -> None:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=64,
        height=64,
        count=array.shape[0],
        dtype=str(array.dtype),
        crs="EPSG:32613",
        transform=from_origin(500000, 4400000, 30, 30),
    ) as dst:
        dst.write(array)


def dataset(root: Path) -> dict[str, Any]:
    chips = []
    for index, split in enumerate(["train", "held_out"]):
        name = f"chip_00{index}_060"
        image, mask = f"{name}_merged.tif", f"{name}.mask.tif"
        make_tiff(root / image, np.full((18, 64, 64), 1500, dtype=np.int16))
        labels = np.full((1, 64, 64), 10, dtype=np.uint8)
        labels[:, :32] = 8
        make_tiff(root / mask, labels)
        if split == "held_out":
            for file in [image, mask]:
                with rasterio.open(root / file, "r+") as dst:
                    dst.transform = from_origin(700000, 4400000, 30, 30)
        chips.append(
            {
                "chip_id": name,
                "tile": f"1{index}TDE",
                "split": split,
                "first_img_date": "2022-03-01T00:00:00Z",
                "middle_img_date": "2022-06-01T00:00:00Z",
                "last_img_date": "2022-09-01T00:00:00Z",
                "image": image,
                "mask": mask,
                "image_url": "https://s3.us-west-2.amazonaws.com/image",
                "mask_url": "https://s3.us-west-2.amazonaws.com/mask",
                "image_sha256": hashlib.sha256((root / image).read_bytes()).hexdigest(),
                "mask_sha256": hashlib.sha256((root / mask).read_bytes()).hexdigest(),
            }
        )
    manifest = {
        "source": "synthetic offline fixture",
        "license": "fixture",
        "resolution": "30 m",
        "period": "2022",
        "selection": "fixture",
        "held_out_tiles": ["11TDE"],
        "chips": chips,
    }
    (root / "manifest.json").write_text(json.dumps(manifest))
    return manifest


def test_train_evaluate_export_offline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset(tmp_path)
    monkeypatch.setattr(train, "Segmenter", FakeSegmenter)
    output = tmp_path / "model"
    train.train(tmp_path, output, steps=2, seed=18, device="cpu")
    report = json.loads((output / "metrics.json").read_text())
    assert report["training_chips"] == report["held_out_chips"] == 1
    assert report["metrics"]["pixels"] == 4096
    assert (
        report["checkpoint_sha256"]
        == hashlib.sha256((output / "model.pt").read_bytes()).hexdigest()
    )
    assert report["metrics"]["accuracy"] == 0.5


def test_chip_corruption_refused(tmp_path: Path) -> None:
    manifest = dataset(tmp_path)
    (tmp_path / manifest["chips"][0]["image"]).write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="checksum"):
        train.read_chip(tmp_path, manifest["chips"][0])


@pytest.mark.parametrize("case", ["leak", "duplicate", "path", "dates"])
def test_manifest_rejects_leakage_and_paths(tmp_path: Path, case: str) -> None:
    manifest = dataset(tmp_path)
    if case == "leak":
        manifest["chips"][1]["tile"] = manifest["chips"][0]["tile"]
    elif case == "duplicate":
        manifest["chips"].append(manifest["chips"][0])
    elif case == "path":
        manifest["chips"][0]["image"] = "../outside.tif"
    else:
        manifest["chips"][0]["last_img_date"] = "2021-01-01"
    with pytest.raises(ValidationError):
        Dataset.model_validate(manifest)


def test_bounded_cached_download(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(capture, "urlopen", lambda *a, **kw: io.BytesIO(b"real response fixture"))
    path = tmp_path / "file"
    assert capture.download("https://example.test", path) == b"real response fixture"
    monkeypatch.setattr(
        capture, "urlopen", lambda *a, **kw: pytest.fail("cache must not call network")
    )
    assert capture.download("https://example.test", path) == b"real response fixture"
    monkeypatch.setattr(capture, "urlopen", lambda *a, **kw: io.BytesIO(b"too long"))
    with pytest.raises(ValueError, match="limit"):
        capture.download("https://example.test", tmp_path / "large", limit=2)
    assert not (tmp_path / "large").exists()


def test_hero_publication_smoke_and_integrity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "repo"
    (root / "pipelines").mkdir(parents=True)
    # Small polygon wholly inside the UTM input; mask tests below use an independent transform.
    from rasterio.warp import transform_geom

    geometry = transform_geom(
        "EPSG:32613",
        "EPSG:4326",
        {
            "type": "Polygon",
            "coordinates": [
                [
                    [500060, 4399940],
                    [500300, 4399940],
                    [500300, 4399700],
                    [500060, 4399700],
                    [500060, 4399940],
                ]
            ],
        },
    )
    (root / "pipelines/hero_fields.yaml").write_text(
        json.dumps({"fields": [{"id": "fixture-field", "geometry": geometry}]})
    )
    monkeypatch.setattr(hero, "ROOT", root)
    monkeypatch.setattr(hero, "Segmenter", FakeSegmenter)
    inputs = tmp_path / "inputs"
    inputs.mkdir()
    raw = np.full((18, 64, 64), 1500, dtype=np.int16)
    invalid = np.zeros((64, 64), dtype=bool)
    invalid[2, 2] = True
    chip = inputs / "fixture-field-2024.npz"
    np.savez_compressed(chip, raw=raw, invalid=invalid)
    source = {
        "bundle_id": "fixture-field",
        "year": 2024,
        "dates": ["2024-03-01", "2024-06-01", "2024-09-01"],
        "location": [40, -105],
        "geometry": geometry,
        "crs": "EPSG:32613",
        "transform": [30, 0, 500000, 0, -30, 4400000],
        "sources": [
            {
                "url": "https://example.test/fixture",
                "date": "2024-03-01",
                "band": "fixture",
                "window_sha256": "0" * 64,
            }
        ]
        * 21,
        "chip_sha256": hashlib.sha256(chip.read_bytes()).hexdigest(),
    }
    HeroChip.model_validate(source)
    chip.with_suffix(".json").write_text(json.dumps(source))
    checkpoint = tmp_path / "model.pt"
    torch.save(FakeSegmenter().state_dict(), checkpoint)
    report = tmp_path / "metrics.json"
    report.write_text(
        json.dumps(
            {
                "model": "synthetic fixture",
                "checkpoint_sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                "limits": ["fixture only"],
            }
        )
    )
    output, bundles = tmp_path / "output", tmp_path / "bundles"
    (bundles / "fixture-field").mkdir(parents=True)
    (bundles / "fixture-field/provenance.json").write_text('{"files": {}}')
    hero.infer(inputs, checkpoint, report, output, bundles)
    result = json.loads((output / "fixture-field/prithvi.json").read_text())
    assert len(result["seasons"]) == 1
    assert "2025" in result["gaps"][0]
    raster = output / "fixture-field/prithvi-2024.tif"
    assert result["seasons"][0]["sha256"] == hashlib.sha256(raster.read_bytes()).hexdigest()
    with rasterio.open(raster) as src:
        assert src.shape == (8, 8)
        assert np.count_nonzero(src.read(1)) == 63
        assert src.nodata == 0
    assert (bundles / "fixture-field/prithvi-2024.tif").read_bytes() == raster.read_bytes()


def test_native_capture_is_offline_and_resumable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sys
    from types import SimpleNamespace

    from rasterio.warp import transform_geom

    root = tmp_path / "repo"
    (root / "pipelines").mkdir(parents=True)
    geometry = transform_geom(
        "EPSG:32613",
        "EPSG:4326",
        {
            "type": "Polygon",
            "coordinates": [
                [
                    [500900, 4399100],
                    [501020, 4399100],
                    [501020, 4398980],
                    [500900, 4398980],
                    [500900, 4399100],
                ]
            ],
        },
    )
    (root / "pipelines/hero_fields.yaml").write_text(
        json.dumps(
            {
                "fields": [
                    {"id": "fixture-field", "geometry": geometry},
                    {"id": "other", "geometry": geometry},
                ]
            }
        )
    )
    frames_dir = root / "apps/web/public/bundles/fixture-field"
    frames_dir.mkdir(parents=True)
    (frames_dir / "frames.json").write_text(
        json.dumps(
            {
                "frames": [
                    {"date": f"{year}-{month}-01", "source": {"product": "HLSL30_VI"}}
                    for year in [2024, 2025]
                    for month in ["03", "06", "09"]
                ]
            }
        )
    )
    bands = ["B02", "B03", "B04", "B05", "B06", "B07", "Fmask"]
    for band in bands:
        make_tiff(
            tmp_path / f"scene.{band}.tif",
            np.full((1, 64, 64), 0 if band == "Fmask" else 1000, dtype=np.int16),
        )
    links = [f"https://example.test/scene.{b}.tif" for b in bands]

    class Result:
        def data_links(self, **kwargs: Any) -> list[str]:
            return links

    fake = SimpleNamespace(
        login=lambda **kw: SimpleNamespace(authenticated=True),
        search_data=lambda **kw: [Result()],
        open=lambda urls, **kw: [io.BytesIO((tmp_path / Path(u).name).read_bytes()) for u in urls],
    )
    monkeypatch.setitem(sys.modules, "earthaccess", fake)
    monkeypatch.setattr(hero, "ROOT", root)
    monkeypatch.setattr(hero, "load_dotenv", lambda *a: None)
    output = tmp_path / "captured"
    hero.capture(output, only="fixture-field")
    for year in [2024, 2025]:
        sidecar = HeroChip.model_validate_json((output / f"fixture-field-{year}.json").read_bytes())
        assert len(sidecar.sources) == 21
        with np.load(output / f"fixture-field-{year}.npz") as data:
            assert data["raw"].shape == (18, 64, 64)
            assert not data["invalid"].any()
    fake.search_data = lambda **kw: pytest.fail(
        "completed capture must resume without source calls"
    )
    hero.capture(output, only="fixture-field")
    fake.search_data = lambda **kw: []
    with pytest.raises(ValueError, match="no HLS spectral"):
        hero.capture(tmp_path / "missing", only="fixture-field")
    fake.login = lambda **kw: SimpleNamespace(authenticated=False)
    with pytest.raises(ValueError, match="authentication"):
        hero.capture(output, only="fixture-field")


def test_public_dataset_capture_selection_without_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import csv

    rows = []
    for i, tile in enumerate(["17TPH"] * 5 + ["18STE"] * 4 + ["13TDE"] * 4):
        rows.append(
            {
                "chip_id": f"chip_{i:03d}_060",
                "tile": tile,
                "first_img_date": "2022-03-01T00:00:00Z",
                "middle_img_date": "2022-06-01T00:00:00Z",
                "last_img_date": "2022-09-01T00:00:00Z",
            }
        )
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    mask = tmp_path / "mask.tif"
    labels = np.full((1, 64, 64), 10, dtype=np.uint8)
    labels[:, :, :32] = 8
    make_tiff(mask, labels)

    def download(url: str, target: Path, limit: int = 4_000_000) -> bytes:
        data = (
            stream.getvalue().encode()
            if url.endswith("csv")
            else mask.read_bytes()
            if "mask" in url
            else b"synthetic image bytes"
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return data

    monkeypatch.setattr(capture, "download", download)
    output = tmp_path / "capture"
    capture.capture(output, count=8)
    manifest = Dataset.model_validate_json((output / "manifest.json").read_bytes())
    assert len(manifest.chips) == 12
    assert len([c for c in manifest.chips if c.split == "train"]) == 8
    assert not {c.tile for c in manifest.chips if c.split == "train"} & {
        c.tile for c in manifest.chips if c.split == "held_out"
    }
    with pytest.raises(ValueError, match="not enough"):
        capture.capture(tmp_path / "insufficient", count=64)
