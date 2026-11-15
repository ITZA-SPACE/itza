"""Add the detailed 3D surface to existing hero publications, preserving every other asset."""

import argparse
import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from itza_science.contracts.field_bundle_schema import FieldBundle
from itza_science.core.config import Settings
from itza_science.core.field import field_id
from itza_science.main import create_app
from itza_science.terrain.models import TerrainIndex
from itza_science.terrain.service import SpatialService

from build_demo import RELIEF_ASSETS, ROOT, Manifest, publish_relief, seal_publication
from capture_fixtures import digest, write_json

# Notes written by an earlier relief refresh; replaced, never stacked.
RELIEF_NOTES = {"relief", "elevation", "imagery"}


async def refresh_field(directory: Path, spatial: SpatialService) -> dict[str, Any]:
    bundle = FieldBundle.model_validate_json((directory / "bundle.json").read_bytes())
    geometry = bundle.field.geometry
    relief, gaps = await spatial.relief(geometry)
    if relief is None:
        reason = "; ".join(gap.reason for gap in gaps) or "no relief source configured"
        raise ValueError(
            f"no relief for {directory.name} ({reason}); previous publication retained"
        )
    with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".relief-refresh-") as tmp:
        staging = Path(tmp) / directory.name
        shutil.copytree(directory, staging)
        shutil.rmtree(staging / RELIEF_ASSETS, ignore_errors=True)
        publish_relief(relief, spatial, field_id(geometry).removeprefix("sha256:"), staging)
        terrain = TerrainIndex.model_validate_json((staging / "terrain.json").read_bytes())
        terrain.relief = relief
        terrain.gaps = [gap for gap in terrain.gaps if gap.var not in RELIEF_NOTES] + gaps
        write_json(staging / "terrain.json", terrain.model_dump(mode="json"))
        record = json.loads((staging / "provenance.json").read_text())
        record["relief_refresh"] = {
            "code_sha256": digest(Path(__file__).read_bytes()),
            "sources": sorted(
                {
                    f"{source.source} {source.product} {source.version}"
                    for source in (relief.elevation_source, relief.imagery_source)
                    if source is not None
                }
            ),
        }
        record = seal_publication(staging, record)
        backup = Path(tmp) / "previous"
        directory.rename(backup)
        try:
            staging.rename(directory)
        except OSError:
            backup.rename(directory)
            raise
    return record


async def main(output: Path, cache: Path, only: list[str] | None) -> None:
    settings = Settings(_env_file=ROOT / "services/science-api/.env", data_dir=cache / "service")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        manifest = Manifest.model_validate_json((output / "index.json").read_bytes())
        for hero in manifest.fields:
            if only and hero.id not in only:
                continue
            try:
                record = await refresh_field(output / hero.id, app.state.spatial)
            except ValueError as error:
                print(f"{hero.id}: {error}", flush=True)
                continue
            sources = ", ".join(record["relief_refresh"]["sources"])
            print(f"{hero.id}: relief published from {sources}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "apps/web/public/bundles")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--only", nargs="+")
    args = parser.parse_args()
    asyncio.run(main(args.output, args.cache, args.only))
