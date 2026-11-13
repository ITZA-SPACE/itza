"""Capture a bounded spatially separated subset of the official HLS/CDL dataset."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
from typing import cast
from urllib.request import urlopen

import numpy as np
import rasterio

HF = "https://huggingface.co/datasets/ibm-nasa-geospatial/multi-temporal-crop-classification"
S3 = "https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/clarkcga/multi-temporal-crop-classification"
# Entire HLS tiles are reserved before looking at performance. Hero regions never train.
HELD_OUT_TILES = {"13TDE", "14TNR", "11TPH", "12TYR"}


def download(url: str, target: Path, limit: int = 4_000_000) -> bytes:
    if target.exists():
        return target.read_bytes()
    with urlopen(url, timeout=90) as response:
        content = cast(bytes, response.read(limit + 1))
    if len(content) > limit:
        raise ValueError("source exceeds capture limit")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return content


def capture(output: Path, count: int) -> None:
    raw = download(f"{HF}/resolve/main/chips_df.csv", output / "chips_df.csv")
    rows = list(csv.DictReader(io.StringIO(raw.decode())))
    selected: list[dict[str, object]] = []
    counts = {"train": 0, "held_out": 0}
    tiles: dict[str, int] = {}
    for row in rows:
        tile, name = row["tile"], row["chip_id"]
        split = "held_out" if tile in HELD_OUT_TILES else "train"
        goal = count if split == "train" else max(4, count // 3)
        if counts[split] >= goal or tiles.get(tile, 0) >= 4:
            continue
        mask_url = f"{S3}/masks/{name}.mask.tif"
        mask = download(mask_url, output / f"{name}.mask.tif")
        with rasterio.MemoryFile(mask) as memory, memory.open() as src:
            labels = src.read(1)
        # Targeted crop/fallow benchmark: both classes represented, no score selection.
        if np.sum(labels == 10) < 64 or np.sum(np.isin(labels, [3, 4, 8, 9, 11, 12])) < 64:
            continue
        image_url = f"{S3}/hls/{name}_merged.tif"
        image = download(image_url, output / f"{name}_merged.tif")
        selected.append(
            {
                **row,
                "split": split,
                "image": f"{name}_merged.tif",
                "mask": f"{name}.mask.tif",
                "image_url": image_url,
                "mask_url": mask_url,
                "image_sha256": hashlib.sha256(image).hexdigest(),
                "mask_sha256": hashlib.sha256(mask).hexdigest(),
            }
        )
        counts[split] += 1
        tiles[tile] = tiles.get(tile, 0) + 1
        print(name, tile, split, counts, flush=True)
        if counts["train"] >= count and counts["held_out"] >= max(4, count // 3):
            break
    if counts["train"] < count or counts["held_out"] < 4:
        raise ValueError("not enough independent labelled chips")
    (output / "manifest.json").write_text(
        json.dumps(
            {
                "source": HF,
                "license": "CC-BY-4.0",
                "resolution": "30 m",
                "period": "2022",
                "selection": "source CSV order; <=4 chips per HLS tile; >=64 crop and fallow pixels each",
                "held_out_tiles": sorted(HELD_OUT_TILES),
                "chips": selected,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--count", type=int, default=16, choices=range(8, 65))
    args = parser.parse_args()
    capture(args.output, args.count)
