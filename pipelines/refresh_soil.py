"""Refresh soil in existing hero publications, preserving NASA assets and integrity hashes."""

import argparse
import asyncio
import json
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from itza_science.adapters.ssurgo import SoilAdapter
from itza_science.contracts.field_bundle_schema import FieldBundle, Gap
from itza_science.core.field import to_shapely

from build_demo import ROOT, Manifest, bundle_document, seal_publication
from capture_fixtures import digest, write_json

CORE = {"clay_pct", "sand_pct", "silt_pct", "soc_pct", "ph", "awc_mm_per_m"}


async def refresh_field(directory: Path, adapter: SoilAdapter) -> dict[str, Any]:
    bundle = FieldBundle.model_validate_json((directory / "bundle.json").read_bytes())
    result = await adapter.fetch(to_shapely(bundle.field.geometry))
    if not CORE <= result.soil.keys():
        raise ValueError(f"incomplete soil for {directory.name}; previous publication retained")
    bundle.soil = result.soil
    bundle.generated_at = datetime.now(UTC)
    bundle.gaps = [gap for gap in bundle.gaps if gap.var not in {"soil", *CORE}]
    bundle.gaps.extend(result.gaps)
    bundle.gaps.append(
        Gap(
            var="soil",
            reason="Mapped soil is not a farmer soil test; local confirmation required",
            severity="info",
        )
    )
    with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".soil-refresh-") as tmp:
        staging = Path(tmp) / directory.name
        shutil.copytree(directory, staging)
        write_json(staging / "bundle.json", bundle_document(bundle))
        write_json(staging / "soil.json", result.model_dump(mode="json"))
        record = json.loads((staging / "provenance.json").read_text())
        record["soil_refresh"] = {
            "code_sha256": digest(Path(__file__).read_bytes()),
            "sources": sorted({value.source for value in result.soil.values()}),
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


async def main(output: Path, captures: Path | None) -> None:
    async def capture(response: httpx.Response) -> None:
        if captures is None:
            return
        payload = await response.aread()
        key = digest(str(response.request.url).encode() + response.request.content + payload)
        write_json(
            captures / f"{key}.json",
            {
                "url": str(response.request.url),
                "request": response.request.content.decode(),
                "retrieved": datetime.now(UTC).isoformat(),
                "status": response.status_code,
                "response_sha256": digest(payload),
                "response_file": f"{key}.bin",
            },
        )
        (captures / f"{key}.bin").write_bytes(payload)

    async with httpx.AsyncClient(event_hooks={"response": [capture]}) as client:
        adapter = SoilAdapter(client)
        manifest = Manifest.model_validate_json((output / "index.json").read_bytes())
        for hero in manifest.fields:
            name = hero.id
            await refresh_field(output / name, adapter)
            print(f"{name}: soil refreshed and publication integrity verified", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "apps/web/public/bundles")
    parser.add_argument("--captures", type=Path)
    args = parser.parse_args()
    asyncio.run(main(args.output, args.captures))
