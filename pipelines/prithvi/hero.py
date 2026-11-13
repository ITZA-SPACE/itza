"""Capture native six-band HLS windows at recorded hero dates; precompute class maps."""

import argparse
import hashlib
import json
import subprocess
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import torch
import yaml
from dotenv import load_dotenv
from rasterio.features import geometry_mask
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject, transform, transform_geom
from rasterio.windows import Window

from contracts import HeroChip
from model import MEAN, Segmenter, classify, normalize

ROOT = Path(__file__).resolve().parents[2]


def capture(output: Path, only: str | None = None) -> None:
    import earthaccess

    load_dotenv(ROOT / "services/science-api/.env")
    if not earthaccess.login(strategy="environment", persist=False).authenticated:
        raise ValueError("Earthdata authentication unavailable")
    fields = yaml.safe_load((ROOT / "pipelines/hero_fields.yaml").read_text())["fields"]
    output.mkdir(parents=True, exist_ok=True)
    for field in fields:
        name = field["id"]
        if only is not None and name != only:
            continue
        frames = json.loads((ROOT / "apps/web/public/bundles" / name / "frames.json").read_text())[
            "frames"
        ]
        coords = np.asarray(field["geometry"]["coordinates"][0])
        lon, lat = coords[:-1].mean(axis=0)
        for year in (2024, 2025):
            target = output / f"{name}-{year}.npz"
            sidecar = target.with_suffix(".json")
            if target.exists() and sidecar.exists():
                continue
            candidates = [f for f in frames if f["date"].startswith(str(year))]
            selected: list[dict[str, Any]] = []
            scenes: list[tuple[dict[str, Any], Any]] = []
            capture_gaps = []
            for month in (4, 6, 9):
                remaining = sorted(
                    [f for f in candidates if f["date"] not in {s["date"] for s in selected}],
                    key=lambda f: abs(datetime.fromisoformat(f["date"]).month - month),
                )
                for frame in remaining:
                    day = frame["date"]
                    product = frame["source"]["product"].replace("_VI", "")
                    found = earthaccess.search_data(
                        short_name=product,
                        version="2.0",
                        temporal=(day, day),
                        bounding_box=(lon - 0.00001, lat - 0.00001, lon + 0.00001, lat + 0.00001),
                        count=10,
                    )
                    if found:
                        selected.append(frame)
                        scenes.append((frame, found[0]))
                        break
                    capture_gaps.append(
                        f"{day} {product}: no matching native spectral granule; tried next recorded date"
                    )
                else:
                    raise ValueError(f"no HLS spectral granule for {name} {year}")
            selected.sort(key=lambda f: f["date"])
            scenes.sort(key=lambda pair: pair[0]["date"])
            arrays, masks, sources = [], [], []
            profile: dict[str, Any] = {}
            for frame, scene in scenes:
                day = frame["date"]
                product = frame["source"]["product"].replace("_VI", "")
                links = scene.data_links(access="external")
                bands = (
                    ["B02", "B03", "B04", "B05", "B06", "B07"]
                    if product == "HLSL30"
                    else ["B02", "B03", "B04", "B8A", "B11", "B12"]
                )
                values = []
                for band in [*bands, "Fmask"]:
                    url = next(u for u in links if u.endswith(f".{band}.tif"))
                    with (
                        closing(
                            earthaccess.open(
                                [url],
                                open_kwargs={"cache_type": "blockcache", "block_size": 262144},
                            )[0]
                        ) as handle,
                        rasterio.open(handle) as src,
                    ):
                        xs, ys = transform("EPSG:4326", src.crs, [lon], [lat])
                        row, col = src.index(xs[0], ys[0])
                        win = Window(col - 32, row - 32, 64, 64)
                        data = src.read(
                            1,
                            window=win,
                            boundless=True,
                            fill_value=255 if band == "Fmask" else -9999,
                        )
                        native = src.window_transform(win)
                        if not profile:
                            profile = {"crs": str(src.crs), "transform": list(native)[:6]}
                        dest = np.empty((64, 64), dtype=data.dtype)
                        reproject(
                            data,
                            dest,
                            src_transform=native,
                            src_crs=src.crs,
                            dst_transform=Affine(*profile["transform"]),
                            dst_crs=profile["crs"],
                            resampling=Resampling.nearest,
                            dst_nodata=255 if band == "Fmask" else -9999,
                        )
                    if band == "Fmask":
                        masks.append((dest == 255) | ((dest.astype(np.uint16) & 31) != 0))
                    else:
                        values.append(dest)
                    sources.append(
                        {
                            "url": url,
                            "date": day,
                            "band": band,
                            "window_sha256": hashlib.sha256(dest.tobytes()).hexdigest(),
                        }
                    )
                arrays.extend(values)
                print("captured", name, day, flush=True)
            raw = np.stack(arrays)
            invalid = np.any(np.stack(masks), axis=0) | np.any(raw == -9999, axis=0)
            np.savez_compressed(target, raw=raw, invalid=invalid)
            sidecar.write_text(
                json.dumps(
                    {
                        "bundle_id": name,
                        "year": year,
                        "dates": [f["date"] for f in selected],
                        "location": [lat, lon],
                        "geometry": field["geometry"],
                        **profile,
                        "sources": sources,
                        "gaps": capture_gaps,
                        "chip_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                    },
                    indent=2,
                )
                + "\n"
            )


def write_publication(path: Path, document: dict[str, Any]) -> None:
    text = json.dumps(document, indent=2) + "\n"
    formatter = ROOT / "node_modules/.bin/biome"
    if formatter.is_file():
        text = subprocess.run(
            [str(formatter), "format", "--stdin-file-path=publication.json"],
            input=text,
            text=True,
            capture_output=True,
            check=True,
        ).stdout
    path.write_text(text)


def infer(inputs: Path, checkpoint: Path, report: Path, output: Path, bundles: Path) -> None:
    torch.set_num_threads(4)
    model = Segmenter(pretrained=False)
    model.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    model.eval()
    metrics = json.loads(report.read_text())
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != metrics["checkpoint_sha256"]:
        raise ValueError("checkpoint does not match validation report")
    for field in yaml.safe_load((ROOT / "pipelines/hero_fields.yaml").read_text())["fields"]:
        name = field["id"]
        seasons, gaps = [], []
        directory = output / name
        directory.mkdir(parents=True, exist_ok=True)
        for year in (2024, 2025):
            path = inputs / f"{name}-{year}.npz"
            if not path.exists():
                gaps.append(f"{year}: no captured six-band HLS chip")
                continue
            source = HeroChip.model_validate_json(
                path.with_suffix(".json").read_bytes()
            ).model_dump(mode="json")
            gaps.extend(source["gaps"])
            if hashlib.sha256(path.read_bytes()).hexdigest() != source["chip_sha256"]:
                raise ValueError("hero chip checksum mismatch")
            with np.load(path, allow_pickle=False) as saved:
                raw, invalid = saved["raw"].copy(), saved["invalid"]
            if raw.shape != (18, 64, 64) or invalid.shape != (64, 64) or invalid.dtype != np.bool_:
                raise ValueError("invalid captured hero array dimensions or mask")
            raw = raw.astype(np.float32)
            # Missing observations get pretrained channel mean, with output strictly masked.
            data = raw.reshape(3, 6, 64, 64)
            data[:, :, invalid] = np.broadcast_to(MEAN[None, :, None], (3, 6, int(invalid.sum())))
            x = torch.from_numpy(normalize(data.reshape(18, 64, 64)))[None]
            dates = [datetime.fromisoformat(d) for d in source["dates"]]
            temporal = torch.tensor(
                [[[d.year, d.timetuple().tm_yday] for d in dates]], dtype=torch.float32
            )
            location = torch.tensor([source["location"]], dtype=torch.float32)
            predicted = classify(model, x, temporal, location)
            affine = Affine(*source["transform"])
            polygon = transform_geom("EPSG:4326", source["crs"], source["geometry"])
            inside = geometry_mask([polygon], out_shape=(64, 64), transform=affine, invert=True)
            predicted[invalid | ~inside] = 0
            rows, cols = np.where(inside)
            win = Window.from_slices(
                (int(rows.min()), int(rows.max()) + 1), (int(cols.min()), int(cols.max()) + 1)
            )
            array = predicted[
                int(win.row_off) : int(win.row_off + win.height),
                int(win.col_off) : int(win.col_off + win.width),
            ]
            file = f"prithvi-{year}.tif"
            with rasterio.open(
                directory / file,
                "w",
                driver="GTiff",
                width=array.shape[1],
                height=array.shape[0],
                count=1,
                dtype="uint8",
                nodata=0,
                crs=source["crs"],
                transform=rasterio.windows.transform(win, affine),
                compress="deflate",
            ) as dst:
                dst.write(array, 1)
            if not array.any():
                gaps.append(f"{year}: no field pixels valid across all three HLS dates")
            provenance = [
                {
                    "source": "NASA HLS v2 six bands, Fmask bits 0–4 excluded; three-date intersection; captured chip SHA-256 "
                    + source["chip_sha256"],
                    "resolution": "30 m",
                    "period": ", ".join(source["dates"]),
                },
                {
                    "source": "Prithvi tiny-TL fine-tuned on 2022 HLS/CDL; validation report SHA-256 "
                    + hashlib.sha256(report.read_bytes()).hexdigest(),
                    "resolution": "30 m",
                    "period": "2022 training and spatial holdout",
                },
            ]
            seasons.append(
                {
                    "year": year,
                    "file": file,
                    "sha256": hashlib.sha256((directory / file).read_bytes()).hexdigest(),
                    "provenance": provenance,
                }
            )
            print(name, year, "valid pixels", int((array > 0).sum()), flush=True)
        publication = {
            "version": "prithvi/1",
            "status": "experimental",
            "bundle_id": name,
            "model": metrics["model"],
            "checkpoint_sha256": digest,
            "classes": {"0": "no data", "1": "crop", "2": "fallow or idle cropland"},
            "seasons": seasons,
            "gaps": gaps,
            "limitations": metrics["limits"]
            + [
                f"2022 HLS/CDL 30 m held-out accuracy {metrics['metrics']['accuracy']:.6f}, fallow IoU {metrics['metrics']['iou_fallow']:.6f}; compare the training-majority baseline in the validation report before use.",
                "2024–2025 transfer predictions; not validated against contemporaneous hero labels.",
                "All seasons before 2024 lack six-band captures; no historical class maps synthesized.",
            ],
        }
        write_publication(directory / "prithvi.json", publication)
        # Additive sidecars leave the FieldBundle schema and existing layer contracts intact.
        destination = bundles / name
        destination.mkdir(parents=True, exist_ok=True)
        for artifact in directory.iterdir():
            (destination / artifact.name).write_bytes(artifact.read_bytes())
        provenance_path = destination / "provenance.json"
        if provenance_path.exists():
            record = json.loads(provenance_path.read_text())
            record["prithvi"] = {
                "pipeline_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "validation_report_sha256": hashlib.sha256(report.read_bytes()).hexdigest(),
                "checkpoint_sha256": digest,
            }
            for artifact in directory.iterdir():
                record["files"][artifact.name] = hashlib.sha256(artifact.read_bytes()).hexdigest()
            write_publication(provenance_path, record)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("capture")
    c.add_argument("output", type=Path)
    c.add_argument(
        "--only", choices=["setif-story", "akron-proof-1", "akron-proof-2", "akron-proof-3"]
    )
    i = sub.add_parser("infer")
    i.add_argument("inputs", type=Path)
    i.add_argument("checkpoint", type=Path)
    i.add_argument("report", type=Path)
    i.add_argument("output", type=Path)
    i.add_argument("--bundles", type=Path, default=ROOT / "apps/web/public/bundles")
    args = parser.parse_args()
    if args.command == "capture":
        capture(args.output, args.only)
    else:
        infer(args.inputs, args.checkpoint, args.report, args.output, args.bundles)
