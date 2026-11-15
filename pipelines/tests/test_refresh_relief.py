"""Offline relief-only publication, idempotence and failure preservation."""

import asyncio
import json
import shutil
from datetime import date
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest
from itza_science.contracts.common_schema import Period
from itza_science.terrain.models import Source, TerrainIndex
from itza_science.terrain.service import ReliefSources, SpatialService
from itza_science.terrain.sources import Inputs
from PIL import Image

import build_demo
import refresh_relief
from capture_fixtures import digest
from refresh_relief import main, refresh_field

ROOT = Path(__file__).resolve().parents[2]


def proof(product: str, resolution: float) -> Source:
    return Source(
        source="synthetic",
        product=product,
        version="1",
        resolution_m=resolution,
        period=Period(start=date(2020, 5, 9), end=date(2020, 9, 7)),
        method="synthetic fixture",
    )


class Surface:
    def __init__(self, available: bool = True) -> None:
        self.available = available

    async def elevation(self, grid: Any) -> tuple[Any, Source] | None:
        if not self.available:
            return None
        rows = np.linspace(1010, 1000, grid.height)[:, None]
        return np.broadcast_to(rows, (grid.height, grid.width)).copy(), proof("lidar", 1)

    async def imagery(self, grid: Any) -> tuple[bytes, Source] | None:
        if not self.available:
            return None
        out = BytesIO()
        Image.fromarray(
            np.random.default_rng(1).integers(0, 255, (32, 32, 3), dtype=np.uint8), "RGB"
        ).save(out, "JPEG")
        return out.getvalue(), proof("aerial", 1)


class NoDem:
    async def dem(self, grid: Any) -> Inputs:
        return Inputs()

    async def series(self, grid: Any, period: Any, field_key: str) -> Inputs:
        return Inputs()


def service(root: Path, available: bool = True) -> SpatialService:
    return SpatialService(
        root,
        NoDem(),
        ReliefSources(Surface(available), Surface(available)),
    )


@pytest.mark.integration
def test_refresh_adds_relief_and_preserves_the_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "akron-proof-1"
    shutil.copytree(ROOT / "apps/web/public/bundles/akron-proof-1", target)
    shutil.rmtree(target / build_demo.RELIEF_ASSETS, ignore_errors=True)
    untouched = (target / "prithvi-2024.tif").read_bytes()
    layers = json.loads((target / "terrain.json").read_text())["layers"]

    async def run() -> None:
        spatial = service(tmp_path / "service")
        record = await refresh_field(target, spatial)
        for file, hash_ in record["files"].items():
            assert digest((target / file).read_bytes()) == hash_
        assert record["relief_refresh"]["sources"] == ["synthetic aerial 1", "synthetic lidar 1"]
        terrain = TerrainIndex.model_validate_json((target / "terrain.json").read_bytes())
        assert terrain.relief is not None
        assert terrain.layers == layers
        assert terrain.relief.heightmap.startswith("assets/relief/")
        assert terrain.relief.imagery is not None
        with Image.open(target / terrain.relief.heightmap) as image:
            assert image.size == (terrain.relief.width, terrain.relief.height)
        assert (target / terrain.relief.imagery).read_bytes().startswith(b"\xff\xd8")
        assert (target / "prithvi-2024.tif").read_bytes() == untouched
        # Running again replaces the package: no second copy, no stacked notes.
        first = sorted(p.name for p in (target / "assets/relief").iterdir())
        gaps = terrain.gaps
        await refresh_field(target, spatial)
        again = TerrainIndex.model_validate_json((target / "terrain.json").read_bytes())
        assert sorted(p.name for p in (target / "assets/relief").iterdir()) == first
        assert again.gaps == gaps
        # No source: the complete publication stays as it was.
        previous = (target / "terrain.json").read_bytes()
        with pytest.raises(ValueError, match="no relief for akron-proof-1"):
            await refresh_field(target, service(tmp_path / "empty", available=False))
        with pytest.raises(ValueError, match="no relief source configured"):
            await refresh_field(target, SpatialService(tmp_path / "bare", NoDem()))
        assert (target / "terrain.json").read_bytes() == previous
        monkeypatch.setattr(build_demo, "HEIGHTMAP_MAX_BYTES", 1)
        with pytest.raises(ValueError, match=r"2\.5 MB"):
            await refresh_field(target, spatial)
        assert (target / "terrain.json").read_bytes() == previous

    asyncio.run(run())


@pytest.mark.integration
def test_main_refreshes_selected_heroes_and_reports_the_rest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    output = tmp_path / "bundles"
    shutil.copytree(ROOT / "apps/web/public/bundles", output)

    class App:
        def __init__(self, spatial: SpatialService) -> None:
            self.state = SimpleNamespace(spatial=spatial)
            self.router = SimpleNamespace(lifespan_context=self.lifespan)

        def lifespan(self, app: object) -> "App":
            return self

        async def __aenter__(self) -> None:
            return None

        async def __aexit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(
        refresh_relief, "create_app", lambda settings: App(service(tmp_path / "service"))
    )
    asyncio.run(main(output, tmp_path / "cache", ["akron-proof-2"]))
    assert "akron-proof-2: relief published from" in capsys.readouterr().out
    assert json.loads((output / "akron-proof-2/terrain.json").read_text())["relief"]
    monkeypatch.setattr(
        refresh_relief,
        "create_app",
        lambda settings: App(service(tmp_path / "none", available=False)),
    )
    asyncio.run(main(output, tmp_path / "cache", ["akron-proof-3"]))
    assert "previous publication retained" in capsys.readouterr().out
