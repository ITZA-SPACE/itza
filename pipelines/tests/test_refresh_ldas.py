import asyncio
import json
import shutil
from datetime import date
from pathlib import Path

import pytest
from itza_science.adapters.base import Period
from itza_science.adapters.dataset_store import StoreGranuleReader
from itza_science.adapters.gldas import GldasAdapter, LandSurfaceReader

import build_demo
from capture_fixtures import digest
from refresh_ldas import main, refresh_field, seed_captures

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.integration
def test_real_clips_refresh_demos_without_network_and_preserve_publications(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output, store = tmp_path / "bundles", tmp_path / "store"
    shutil.copytree(ROOT / "apps/web/public/bundles", output)
    seed_captures(ROOT / "fixtures/ldas", store)
    period = Period(date(2014, 6, 1), date(2014, 6, 1))
    asyncio.run(main(output, store, period))
    for name in ["setif-story", "akron-proof-1", "akron-proof-2", "akron-proof-3"]:
        folder = output / name
        record = json.loads((folder / "provenance.json").read_text())
        assert record["ldas_refresh"]["sources"]
        for file, checksum in record["files"].items():
            assert digest((folder / file).read_bytes()) == checksum
        assert (folder / "prithvi-2024.tif").read_bytes() == (
            ROOT / "apps/web/public/bundles" / name / "prithvi-2024.tif"
        ).read_bytes()
    reader = StoreGranuleReader(store, LandSurfaceReader(tmp_path / "unused"), allow_live=False)
    adapter = GldasAdapter(reader, history_reader=reader)
    folder = output / "setif-story"
    before = (folder / "bundle.json").read_bytes()
    assert not asyncio.run(
        refresh_field(folder, adapter, Period(date(1999, 1, 1), date(1999, 1, 1)))
    )
    assert (folder / "bundle.json").read_bytes() == before
    monkeypatch.setattr(build_demo, "MAX_FIELD_BYTES", 1)
    with pytest.raises(ValueError, match="5 MB"):
        asyncio.run(refresh_field(folder, adapter, period))
    assert (folder / "bundle.json").read_bytes() == before
    captures = tmp_path / "captures"
    shutil.copytree(ROOT / "fixtures/ldas", captures)
    next(captures.glob("*/*.nc4")).write_bytes(b"bad")
    with pytest.raises(ValueError, match="hash mismatch"):
        seed_captures(captures, tmp_path / "bad-store")
