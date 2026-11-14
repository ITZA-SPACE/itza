"""Offline soil-only publication and failure preservation."""

import asyncio
import json
import shutil
from pathlib import Path

import httpx
import pytest
from itza_science.adapters.ssurgo import SoilAdapter, SoilResult

import build_demo
from capture_fixtures import digest
from refresh_soil import refresh_field

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.integration
def test_refresh_preserves_assets_and_updates_integrity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "setif-story"
    shutil.copytree(ROOT / "apps/web/public/bundles/setif-story", target)
    before = (target / "prithvi-2024.tif").read_bytes()
    result = SoilResult.model_validate_json((target / "soil.json").read_bytes())

    async def run() -> None:
        async with httpx.AsyncClient() as client:
            adapter = SoilAdapter(client)

            async def fixture(*args: object) -> SoilResult:
                return result

            monkeypatch.setattr(adapter, "fetch", fixture)
            record = await refresh_field(target, adapter)
            assert (
                json.loads((target / "bundle.json").read_text())["soil"]["clay_pct"]["source"]
                == "soilgrids"
            )
            for file, hash_ in record["files"].items():
                assert digest((target / file).read_bytes()) == hash_
            assert (target / "prithvi-2024.tif").read_bytes() == before
            # A failed provider never replaces a previously complete publication.
            previous = (target / "bundle.json").read_bytes()

            async def missing(*args: object) -> SoilResult:
                return SoilResult()

            monkeypatch.setattr(adapter, "fetch", missing)
            with pytest.raises(ValueError, match="incomplete soil"):
                await refresh_field(target, adapter)
            assert (target / "bundle.json").read_bytes() == previous
            monkeypatch.setattr(adapter, "fetch", fixture)
            monkeypatch.setattr(build_demo, "MAX_FIELD_BYTES", 1)
            with pytest.raises(ValueError, match="5 MB"):
                await refresh_field(target, adapter)
            assert (target / "bundle.json").read_bytes() == previous

    asyncio.run(run())


@pytest.mark.unit
@pytest.mark.parametrize(
    "name,expected",
    [
        ("setif-story", "soilgrids"),
        ("akron-proof-1", "ssurgo"),
        ("akron-proof-2", "ssurgo"),
        ("akron-proof-3", "ssurgo"),
    ],
)
def test_committed_demo_soil(name: str, expected: str) -> None:
    directory = ROOT / "apps/web/public/bundles" / name
    bundle = json.loads((directory / "bundle.json").read_text())
    metadata = json.loads((directory / "soil.json").read_text())
    assert bundle["soil"] == metadata["soil"]
    for variable in ("clay_pct", "sand_pct", "silt_pct", "soc_pct", "ph", "awc_mm_per_m"):
        assert bundle["soil"][variable]["source"] == expected
    assert metadata["provenance"]
    if expected == "ssurgo":
        assert bundle["soil"]["soc_pct"]["confidence"] == "low"
    record = json.loads((directory / "provenance.json").read_text())
    for file in ("bundle.json", "soil.json"):
        assert record["files"][file] == digest((directory / file).read_bytes())
