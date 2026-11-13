"""Seeded CPU/GPU fine-tuning, spatial holdout evaluation and checkpoint export."""

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import torch
from rasterio.warp import transform, transform_bounds
from torch import Tensor
from torch.nn import functional as F

from contracts import Dataset
from model import BASE_REVISION, Segmenter, binary_labels, classify, normalize, scores


def read_chip(root: Path, chip: dict[str, Any]) -> tuple[Tensor, Tensor, Tensor, Tensor]:
    for key in ("image", "mask"):
        path = root / chip[key]
        if hashlib.sha256(path.read_bytes()).hexdigest() != chip[f"{key}_sha256"]:
            raise ValueError("captured chip checksum mismatch")
    with rasterio.open(root / chip["image"]) as src:
        x = torch.from_numpy(normalize(src.read()))
        cx, cy = src.xy(src.height // 2, src.width // 2)
        lon, lat = transform(src.crs, "EPSG:4326", [cx], [cy])
        location = torch.tensor([[lat[0], lon[0]]], dtype=torch.float32)
    with rasterio.open(root / chip["mask"]) as src:
        target = torch.from_numpy(binary_labels(src.read(1)))
    dates = [
        datetime.fromisoformat(chip[key])
        for key in ("first_img_date", "middle_img_date", "last_img_date")
    ]
    temporal = torch.tensor([[[d.year, d.timetuple().tm_yday] for d in dates]], dtype=torch.float32)
    return x, target, temporal, location


def spatial_gap(root: Path, training: list[dict[str, Any]], holdout: list[dict[str, Any]]) -> float:
    bounds = {}
    for chip in [*training, *holdout]:
        with rasterio.open(root / chip["image"]) as src:
            bounds[chip["chip_id"]] = transform_bounds(src.crs, "EPSG:5070", *src.bounds)
    distances = []
    for a in training:
        for b in holdout:
            x1, y1, x2, y2 = bounds[a["chip_id"]]
            u1, v1, u2, v2 = bounds[b["chip_id"]]
            dx, dy = max(0, x1 - u2, u1 - x2), max(0, y1 - v2, v1 - y2)
            distances.append(float(np.hypot(dx, dy)))
    minimum = min(distances)
    if minimum < 10_000:
        raise ValueError("held-out fields must be at least 10 km from training chips")
    return minimum


def train(root: Path, output: Path, steps: int, seed: int, device: str) -> None:
    torch.manual_seed(seed)
    torch.set_num_threads(4)
    np.random.seed(seed)
    manifest = Dataset.model_validate_json((root / "manifest.json").read_bytes()).model_dump(
        mode="json"
    )
    chips = manifest["chips"]
    training = [c for c in chips if c["split"] == "train"]
    holdout = [c for c in chips if c["split"] == "held_out"]
    if not training or not holdout or {c["tile"] for c in training} & {c["tile"] for c in holdout}:
        raise ValueError("train and held-out HLS tiles must be disjoint")
    separation = spatial_gap(root, training, holdout)
    model = Segmenter().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001, weight_decay=0.01)
    cache = [read_chip(root, chip) for chip in training]
    rng = np.random.default_rng(seed)
    model.train()
    for step in range(steps):
        x, target, temporal, location = cache[step % len(cache)]
        # Alternate crop/fallow-centered windows; train labels only choose centers.
        candidates = torch.nonzero(target == step % 2)
        row, col = candidates[int(rng.integers(len(candidates)))].tolist()
        row, col = max(0, min(row - 32, x.shape[-2] - 64)), max(0, min(col - 32, x.shape[-1] - 64))
        inputs = x[:, :, row : row + 64, col : col + 64][None].to(device)
        truth = target[row : row + 64, col : col + 64][None].to(device)
        optimizer.zero_grad()
        loss = F.cross_entropy(
            model(inputs, temporal.to(device), location.to(device)), truth, ignore_index=-1
        )
        torch.autograd.backward(loss)
        optimizer.step()
        if step % 10 == 0:
            print("step", step, "loss", float(loss.detach()), flush=True)
    output.mkdir(parents=True, exist_ok=True)
    model.cpu().eval()
    torch.save(model.state_dict(), output / "model.pt")
    matrix = np.zeros((2, 2), dtype=np.int64)
    per_chip = []
    baseline = np.zeros((2, 2), dtype=np.int64)
    majority = int(
        sum((t == 1).sum().item() for _, t, _, _ in cache)
        > sum((t == 0).sum().item() for _, t, _, _ in cache)
    )
    for chip in holdout:
        x, target, temporal, location = read_chip(root, chip)
        predicted = classify(model, x[None], temporal, location).astype(np.int64) - 1
        truth_array = target.numpy()
        valid = truth_array >= 0
        local = np.bincount(2 * truth_array[valid] + predicted[valid], minlength=4).reshape(2, 2)
        matrix += local
        baseline[:, majority] += np.bincount(truth_array[valid], minlength=2)
        per_chip.append({"id": chip["chip_id"], "tile": chip["tile"], **scores(local)})
    report = {
        "model": "Prithvi-EO-2.0-tiny-TL + trainable 1x1 segmentation head",
        "base_revision": BASE_REVISION,
        "torch_version": torch.__version__,
        "seed": seed,
        "steps": steps,
        "minimum_train_holdout_gap_m": separation,
        "training_chips": len(training),
        "held_out_chips": len(holdout),
        "train_tiles": sorted({c["tile"] for c in training}),
        "held_out_tiles": sorted({c["tile"] for c in holdout}),
        "source": manifest["source"],
        "resolution": "30 m",
        "period": "2022",
        "checkpoint_sha256": hashlib.sha256((output / "model.pt").read_bytes()).hexdigest(),
        "data_manifest_sha256": hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest(),
        "metrics": scores(matrix),
        "training_majority_baseline": scores(baseline),
        "per_chip": per_chip,
        "limits": [
            "Small targeted benchmark on CDL-labelled fields within spatially held-out HLS chips; not surveyed field boundaries.",
            "No farmer-confirmed Sétif labels; regional transfer is unvalidated.",
            "CDL fallow/idle is a satellite class, not a management record; no cereal/legume claims.",
            "Only selected crop codes and fallow are scored; other land cover is ignored.",
            "Fixed final training step; held-out results never select hyperparameters or checkpoints.",
        ],
    }
    (output / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "data-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(report["metrics"]), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--steps", type=int, default=80)
    parser.add_argument("--seed", type=int, default=18)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    args = parser.parse_args()
    if not 1 <= args.steps <= 10_000:
        parser.error("steps must be between 1 and 10000")
    train(args.data, args.output, args.steps, args.seed, args.device)
