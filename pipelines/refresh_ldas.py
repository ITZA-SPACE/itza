"""Refresh hero modeled moisture/ET from local clips only; never call Earthdata."""

import argparse
import asyncio
import json
import shutil
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.parse import urlparse

from itza_science.adapters.base import Period
from itza_science.adapters.dataset_store import STORE_PRODUCTS, StoreGranuleReader
from itza_science.adapters.gldas import GldasAdapter, LandSurfaceReader, merge_modeled_fallbacks
from itza_science.contracts.canonical_series_schema import Var
from itza_science.contracts.field_bundle_schema import FieldBundle, Gap
from itza_science.core.field import to_shapely

from build_demo import ROOT, Manifest, bundle_document, seal_publication
from capture_fixtures import digest, write_json


def seed_captures(captures: Path, store: Path) -> None:
    """Import hash-verified capture manifests, retaining native dated file names."""
    for path in captures.glob("*/manifest.json"):
        record = json.loads(path.read_text())
        folder, _ = STORE_PRODUCTS[(record["product"], record["version"])]
        destination = store / folder / path.parent.name
        destination.mkdir(parents=True, exist_ok=True)
        for name, checksum in record["files"].items():
            payload = (path.parent / name).read_bytes()
            if digest(payload) != checksum:
                raise ValueError(f"capture hash mismatch: {name}")
            target = Path(urlparse(record["origin_urls"][name]).path).name
            (destination / target).write_bytes(payload)


async def refresh_field(directory: Path, adapter: GldasAdapter, period: Period) -> bool:
    bundle = FieldBundle.model_validate_json((directory / "bundle.json").read_bytes())
    result = await adapter.fetch(
        to_shapely(bundle.field.geometry), period, (Var.sm_rootzone, Var.et_actual)
    )
    if not result.series:
        return False
    bundle.generated_at = datetime.now(UTC)
    bundle.series = merge_modeled_fallbacks([*bundle.series, *result.series])
    bundle.gaps.append(
        Gap(
            var="sm_rootzone",
            severity="info",
            reason=(
                f"Modeled LDAS refresh covers {period.start} through {period.end} only; "
                "other dates retain their original data or gaps"
            ),
        )
    )
    with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".ldas-refresh-") as tmp:
        staging = Path(tmp) / directory.name
        shutil.copytree(directory, staging)
        write_json(staging / "bundle.json", bundle_document(bundle))
        write_json(
            staging / "ldas.json",
            {
                "series": [s.model_dump(mode="json", exclude_none=True) for s in result.series],
                "gaps": [g.model_dump(mode="json") for g in result.gaps],
            },
        )
        record = json.loads((staging / "provenance.json").read_text())
        record["ldas_refresh"] = {
            "code_sha256": digest(Path(__file__).read_bytes()),
            "period": {"start": str(period.start), "end": str(period.end)},
            "sources": sorted({s.provenance.source for s in result.series}),
        }
        seal_publication(staging, record)
        backup = Path(tmp) / "previous"
        directory.rename(backup)
        try:
            staging.rename(directory)
        except OSError:
            backup.rename(directory)
            raise
    return True


async def main(output: Path, store: Path, period: Period) -> None:
    reader = StoreGranuleReader(store, LandSurfaceReader(store / ".unused"), allow_live=False)
    adapter = GldasAdapter(reader, history_reader=reader)
    manifest = Manifest.model_validate_json((output / "index.json").read_bytes())
    for hero in manifest.fields:
        refreshed = await refresh_field(output / hero.id, adapter, period)
        print(f"{hero.id}: {'refreshed' if refreshed else 'no stored data; retained'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--captures", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "apps/web/public/bundles")
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    if args.captures:
        seed_captures(args.captures, args.store)
    asyncio.run(main(args.output, args.store, Period(args.start, args.end)))
