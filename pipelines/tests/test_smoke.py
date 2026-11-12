"""End-to-end smoke test: `build_one` runs every real stage (series, terrain, frames, zones,
context, and for a proof field CDL) with no Earthdata credentials, so every adapter's own
credential gate keeps it from touching the network (the same gate the live service relies on,
e.g. `HlsViAdapter.fetch`, `EarthdataSpatialSource`, `EarthdataArchive`); CropScape has no such
gate, so its one call is mocked. The result is gap-filled (there is no real data) but must still
be schema-valid and under budget — the two things the full pipeline can silently get wrong.
"""

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx
from itza_science.adapters.base import DataAdapter, Period
from itza_science.adapters.context_archive import EarthdataArchive
from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.clients.cdl import BASE_URL, CdlClient
from itza_science.clients.http import UpstreamClient, build_client
from itza_science.context.service import ContextService
from itza_science.core.config import Settings
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import EarthdataSpatialSource

from build_demo import HeroField, already_built, build_one, load_hero_fields

pytestmark = pytest.mark.smoke

PERIOD = Period(start=date(2025, 1, 1), end=date(2025, 3, 1))


def no_credentials(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        EARTHDATA_TOKEN=None,
        EARTHDATA_USERNAME=None,
        EARTHDATA_PASSWORD=None,
        environment="test",
        data_dir=tmp_path,
        upstream_backoff_s=0,
        upstream_retries=0,
    )


async def _build(field: HeroField, settings: Settings, out_dir: Path) -> None:
    async with build_client(settings) as client:
        upstream = UpstreamClient(client, settings)
        reader = EarthaccessGranuleReader(settings.data_dir / "granules")
        adapters: list[DataAdapter] = [
            ImergAdapter(reader),
            SmapL4Adapter(reader),
            HlsViAdapter(reader),
        ]
        spatial = SpatialService(
            settings.data_dir, EarthdataSpatialSource(reader, settings.data_dir)
        )
        context = ContextService(
            settings.data_dir,
            EarthdataArchive(reader, settings.data_dir / "context-tmp"),
            wait_seconds=settings.context_wait_s,
        )
        cdl = CdlClient(upstream)
        await build_one(field, PERIOD, adapters, spatial, cdl, context, out_dir, refresh=True)


def test_the_story_field_builds_a_schema_valid_bundle_offline(tmp_path: Path) -> None:
    field = next(f for f in load_hero_fields() if f.role == "story")
    import anyio

    anyio.run(_build, field, no_credentials(tmp_path), tmp_path)
    out_dir = tmp_path / field.id

    assert already_built(out_dir)
    assert (out_dir / "terrain.json").is_file()
    assert (out_dir / "zones.json").is_file()
    assert (out_dir / "frames" / "index.json").is_file()
    assert not (out_dir / "cdl.json").is_file()  # story fields carry no CDL layer


@respx.mock
def test_a_proof_field_also_writes_cdl_labels_offline(tmp_path: Path) -> None:
    respx.get(BASE_URL).mock(
        return_value=httpx.Response(
            200,
            text="<Result>Value is 24. Category is Winter Wheat.</Result>",
        )
    )
    field = next(f for f in load_hero_fields() if f.role == "proof")
    import anyio

    anyio.run(_build, field, no_credentials(tmp_path), tmp_path)
    out_dir = tmp_path / field.id

    assert (out_dir / "cdl.json").is_file()
    import json

    labels = json.loads((out_dir / "cdl.json").read_text())
    assert len(labels) >= 1
    assert all(label["classification"] == "crop" for label in labels)
    document = json.loads((out_dir / "bundle.json").read_text())
    assert document["layers"]["cdl"] == "cdl.json"
