"""Offline pipeline tests. Every generated raster/label below is explicitly synthetic."""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest
import rasterio
import yaml
from affine import Affine
from itza_science.adapters.base import Period
from itza_science.api.ml import StressModel
from itza_science.context.models import GediResponse, GraceResponse, SceneResponse
from itza_science.contracts.common_schema import Period as ProofPeriod
from itza_science.contracts.field_bundle_schema import FieldBundle
from itza_science.terrain.models import Source as SpatialProof
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import Inputs, Observation
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

import build_demo as demo
from build_demo import Hero, LiveSource, Manifest
from capture_fixtures import digest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.unit


@pytest.fixture
def hero() -> Hero:
    return Hero(
        id="synthetic-proof",
        role="proof",
        rationale="synthetic test only",
        geometry={
            "type": "Polygon",
            "coordinates": [
                [
                    [-103.16, 40.15],
                    [-103.156, 40.15],
                    [-103.156, 40.154],
                    [-103.16, 40.154],
                    [-103.16, 40.15],
                ]
            ],
        },
    )


def raw_power(start: date, end: date) -> dict[str, Any]:
    return {
        "properties": {
            "parameter": {
                name: {d.strftime("%Y%m%d"): value for d in demo.dates(start, end)}
                for name, value in (
                    ("PRECTOTCORR", 2),
                    ("T2M_MIN", 5),
                    ("T2M_MAX", 20),
                    ("T2M", 12),
                    ("RH2M", 50),
                    ("WS2M", 3),
                    ("ALLSKY_SFC_SW_DWN", 12),
                )
            }
        }
    }


def server_bundle(hero: Hero) -> dict[str, Any]:
    doc = json.loads((ROOT / "fixtures/synthetic/semi-arid-winter-cereal.bundle.json").read_text())
    from itza_science.core.field import area_ha, field_id, to_shapely

    doc["field"].update(
        id=field_id(hero.geometry),
        geometry=hero.geometry.model_dump(),
        centroid=[-103.158, 40.152],
        area_ha=area_ha(to_shapely(hero.geometry)),
    )
    doc["series"] = []
    doc["phenology"] = []
    doc["layers"] = {}
    return dict(doc)


def raster(hero: Hero, values: np.ndarray[Any, Any], *, crs: str | None = "EPSG:4326") -> bytes:
    with rasterio.MemoryFile() as mem:
        with mem.open(
            driver="GTiff",
            height=values.shape[0],
            width=values.shape[1],
            count=1,
            dtype=values.dtype,
            crs=crs,
            transform=Affine(
                0.004 / values.shape[1], 0, -103.16, 0, -0.004 / values.shape[0], 40.154
            ),
            nodata=0,
        ) as ds:
            ds.write(values, 1)
        return bytes(mem.read())


class SpatialFixture:
    async def dem(self, grid: Any) -> Inputs:
        _, cols = np.indices(grid.shape)
        proof = SpatialProof(
            source="synthetic",
            product="synthetic DEM",
            version="1",
            resolution_m=30,
            period=ProofPeriod(start=date(2000, 1, 1), end=date(2000, 1, 1)),
            method="synthetic fixture",
        )
        return Inputs(elevation=1000 - cols.astype(float), dem_source=proof)

    async def series(self, grid: Any, period: Any, field_key: str) -> Inputs:
        rows, cols = np.indices(grid.shape)
        observations = []
        for year in range(period.start.year, period.end.year + 1):
            for month in (3, 6, 9):
                day = date(year, month, 1)
                proof = SpatialProof(
                    source="synthetic",
                    product="synthetic HLS",
                    version="1",
                    resolution_m=30,
                    period=ProofPeriod(start=day, end=day),
                    method="synthetic",
                )
                values = 0.2 + 0.4 * (cols > grid.width // 2) + rows * 0.0001 + month * 0.001
                observations.append(Observation(day, values, proof))
        return Inputs(observations=observations)


class RawFixture:
    def __init__(self, hero: Hero) -> None:
        self.hero = hero

    def json(self, url: str, params: Any) -> dict[str, Any]:
        if url == demo.POWER:
            return raw_power(date(2023, 1, 1), date(2023, 12, 31))
        if url.endswith("/dates"):
            return {"dates": [{"modis_date": "A2023001", "calendar_date": "2023-01-01"}]}
        value = 3000 if params["band"].endswith("NDVI") else 0
        return {
            "nrows": 1,
            "ncols": 1,
            "subset": [{"calendar_date": "2023-01-01", "data": [value]}],
        }

    def get(self, url: str, params: Any) -> bytes:
        return raster(self.hero, np.full((12, 12), 24, dtype="uint8"))


class ContextFixture:
    async def _scenes(self, kind: str, query: Any) -> SceneResponse:
        return SceneResponse(coverage_note="synthetic: no scene coverage", gaps=["synthetic gap"])

    async def _grace(self, query: Any) -> GraceResponse:
        raise OSError("sensitive upstream detail")

    async def _gedi(self, query: Any) -> GediResponse:
        return GediResponse()


@pytest.fixture
def source(tmp_path: Path, hero: Hero) -> LiveSource:
    spatial = SpatialService(tmp_path / "service", SpatialFixture())
    state = SimpleNamespace(
        spatial=spatial, cache=spatial.cache, context=ContextFixture(), bundle_adapters=[]
    )
    return LiveSource(state, RawFixture(hero), 7)  # type: ignore[arg-type]


def test_power_missing_and_modis_qa() -> None:
    start, end = date(2023, 1, 1), date(2023, 1, 3)
    raw = raw_power(start, end)
    raw["properties"]["parameter"]["T2M"]["20230102"] = -999
    result = demo.power_series(raw, start, end)
    mean = next(s for s in result if s["var"] == "tmean")
    assert mean["values"] == [12, None, 12]
    assert mean["quality"] == [0, 2, 0]

    def records(value: int) -> dict[str, Any]:
        return {
            "nrows": 1,
            "ncols": 1,
            "subset": [
                {"calendar_date": "2023-01-01", "data": [value]},
                {"calendar_date": "2023-01-03", "data": [value]},
            ],
        }

    ndvi = demo.modis_series([records(4000)], [records(0)], start, end)
    assert ndvi["values"] == [0.4, None, 0.4]
    assert demo.modis_series([records(4000)], [records(1)], start, end)["values"] == [None] * 3
    assert demo.modis_series([records(-3000)], [records(0)], start, end)["values"] == [None] * 3


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ([[24, 24], [61, 176]], "crop"),
        ([[61, 61], [24, 176]], "fallow"),
        ([[176, 176], [24, 61]], "other"),
        ([[24, 61], [24, 61]], "mixed"),
    ],
)
def test_cdl_histogram(hero: Hero, values: Any, expected: str) -> None:
    result = demo.cdl_label(raster(hero, np.array(values, dtype="uint8")), hero, 2023)
    assert result["label"] == expected
    assert sum(result["histogram"].values()) == result["pixels"] == 4
    assert result["provenance"]["resolution_m"] == 30
    assert (
        demo.cdl_label(raster(hero, np.array(values, dtype="uint8")), hero, 2024)["provenance"][
            "resolution_m"
        ]
        == 10
    )


def test_invalid_cdl(hero: Hero) -> None:
    for payload in (
        raster(hero, np.zeros((2, 2), dtype="uint8")),
        raster(hero, np.ones((2, 2), dtype="uint8"), crs=None),
    ):
        with pytest.raises(ValueError):
            demo.cdl_label(payload, hero, 2023)


def test_manifest_validation(hero: Hero) -> None:
    doc = yaml.safe_load((ROOT / "pipelines/hero_fields.yaml").read_text())
    assert len(Manifest.model_validate(doc).fields) == 4
    for mutate in (
        lambda d: d["fields"].append(d["fields"][0]),
        lambda d: d["period"].update(end="2000-01-01"),
        lambda d: [f.update(role="story") for f in d["fields"]],
        lambda d: [f.update(role="proof") for f in d["fields"]],
    ):
        bad = json.loads(json.dumps(doc))
        mutate(bad)
        with pytest.raises(ValueError):
            Manifest.model_validate(bad)
    with pytest.raises(ValueError):
        Hero.model_validate({**hero.model_dump(), "id": "../escape"})


def test_predictions_and_missing_weather(hero: Hero) -> None:
    start, end = date(2023, 1, 1), date(2023, 12, 31)
    browser = RawFixture(hero)
    series = demo.power_series(browser.json(demo.POWER, {}), start, end)
    series.append(
        demo.canonical(
            "ndvi", "1", [0.5] * 365, start, end, "synthetic", "synthetic", 250, "synthetic"
        )
    )
    model = StressModel(ROOT / "services/science-api/models/stress-v1")
    bundle = demo.merge_bundle(server_bundle(hero), {"series": series})
    result = demo.predict_seasons(bundle, start, end, model)["seasons"][0]
    assert result["prediction"] == pytest.approx(
        result["expected_value"] + sum(d["shap_value"] for d in result["drivers"])
    )
    bundle.series = [s for s in bundle.series if s.var.value != "tmin"]
    assert demo.predict_seasons(bundle, start, end, model)["seasons"][0]["prediction"] is None
    bundle.series = []
    with pytest.raises(ValueError, match="no observed NDVI"):
        demo.merge_bundle(bundle.model_dump(mode="json", by_alias=True), {"series": []})


def test_live_source_stages(source: LiveSource, hero: Hero, tmp_path: Path) -> None:
    async def exercise() -> None:
        start, end = date(2008, 1, 1), date(2023, 12, 31)
        browser = await source.part("browser", hero, start, end, tmp_path)
        assert len(browser["series"]) == 8
        server = await source.part("server", hero, start, end, tmp_path)
        assert FieldBundle.model_validate(server).field.elevation_m is not None
        spatial = await source.part("spatial", hero, start, end, tmp_path)
        assert spatial["terrain"]["available"]
        assert len(spatial["frames"]["frames"]) == 6
        assert all((tmp_path / f["href"]).is_file() for f in spatial["frames"]["frames"])
        context = await source.part("context", hero, start, end, tmp_path)
        assert context["grace"]["status"] == "empty"
        assert "sensitive" not in json.dumps(context)
        labels = await source.part("cdl", hero, start, end, tmp_path)
        assert len(labels["labels"]) == 16
        hero.role = "story"
        assert not (await source.part("cdl", hero, start, end, tmp_path))["labels"]
        hero.role = "proof"
        with pytest.raises(ValueError, match="15 observed"):
            await source.part("cdl", hero, date(2020, 1, 1), end, tmp_path)
        with pytest.raises(ValueError, match="unknown source"):
            await source.part("wrong", hero, start, end, tmp_path)

    asyncio.run(exercise())


@pytest.mark.integration
def test_fixture_end_to_end_resume_and_budgets(
    source: LiveSource, hero: Hero, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model = StressModel(ROOT / "services/science-api/models/stress-v1")

    async def exercise() -> None:
        args = (
            hero,
            date(2008, 1, 1),
            date(2023, 12, 31),
            source,
            model,
            tmp_path / "work",
            tmp_path / "published",
        )
        first = await demo.build_field(*args)
        directory = tmp_path / "published" / hero.id
        bundle = json.loads((directory / "bundle.json").read_text())
        registry: Registry[Any] = Registry()
        for schema_file in (ROOT / "schemas").glob("*.schema.json"):
            schema = json.loads(schema_file.read_text())
            registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
        schema = json.loads((ROOT / "schemas/field-bundle.schema.json").read_text())
        Draft202012Validator(schema, registry=registry).validate(bundle)
        assert len(json.loads((directory / "cdl.json").read_text())["labels"]) == 16
        for name, hash_ in first["files"].items():
            assert digest((directory / name).read_bytes()) == hash_
        old = source.part

        async def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
            raise AssertionError("resume must not fetch completed stages")

        monkeypatch.setattr(source, "part", fail)
        assert first == await demo.build_field(*args)
        monkeypatch.setattr(source, "part", old)
        # Size failures preserve the already published bundle.
        monkeypatch.setattr(demo, "MAX_FIELD_BYTES", 1)
        with pytest.raises(ValueError, match="5 MB"):
            await demo.build_field(*args)
        assert (directory / "bundle.json").read_text() == json.dumps(
            bundle, separators=(",", ":")
        ) + "\n"

    asyncio.run(exercise())


def test_asset_budgets(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source, destination = tmp_path / "source.png", tmp_path / "assets/copy.png"
    source.write_bytes(b"12345")
    monkeypatch.setattr(demo, "MAX_FRAME_BYTES", 4)
    with pytest.raises(ValueError, match="150 KB"):
        demo.copy_asset(source, destination)
    with pytest.raises(ValueError, match="150 KB"):
        demo.check_assets(tmp_path)


@pytest.mark.parametrize("collection", ["SPL4SMGP", "GPM_3IMERGDF", "HLSS30_VI"])
def test_clip_recorded_native_sources(collection: str, tmp_path: Path) -> None:
    from itza_science.adapters.netcdf_grid import load_daily_mean_grid

    recorded = ROOT / "fixtures/earthdata/recorded"
    record = next(
        r
        for r in json.loads((recorded / "manifest.json").read_text())
        if r["collection"] == collection
    )
    lon, lat = record["point"]
    bbox = (lon - 0.00001, lat - 0.00001, lon + 0.00001, lat + 0.00001)
    path = recorded / record["file"]
    output = tmp_path / path.name
    with path.open("rb") as handle:
        demo.ClippedReader.clip(handle, output, bbox, collection)
    assert output.is_file()
    if collection.endswith("_VI"):
        with rasterio.open(path) as original, rasterio.open(output) as clipped:
            assert clipped.crs == original.crs
            assert clipped.scales == original.scales
            assert clipped.width <= original.width
    else:
        var = "sm_surface" if collection == "SPL4SMGP" else "precipitation"
        _, values, invalid = load_daily_mean_grid(output, var)
        assert not invalid.all()
        assert values[~invalid].min() >= 0
        with path.open("rb") as handle, pytest.raises(ValueError, match="native"):
            demo.ClippedReader.clip(handle, output, (0, 0, 0.001, 0.001), collection)


def test_clipped_reader_search_and_sampling(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import earthaccess
    from itza_science.adapters.granules import EarthaccessGranuleReader, GranuleAccessError

    reader = demo.ClippedReader(tmp_path, credentials={"EARTHDATA_TOKEN": "synthetic-test"})
    monkeypatch.setattr(earthaccess, "login", lambda **kw: SimpleNamespace(authenticated=True))

    class Result(dict[str, Any]):
        def data_links(self, **kwargs: Any) -> list[str]:
            return [
                "https://example.test/ignore.xml",
                "https://example.test/a.NDVI.tif",
                "https://example.test/a.Fmask.tif",
            ]

    result = Result(
        umm={"TemporalExtent": {"RangeDateTime": {"BeginningDateTime": "2023-06-01T00:00:00Z"}}}
    )
    monkeypatch.setattr(earthaccess, "search_data", lambda **kw: [result] * 20)
    raw = tmp_path / "raw.txt"
    raw.write_bytes(b"synthetic")
    monkeypatch.setattr(earthaccess, "open", lambda *a, **kw: [raw.open("rb")])

    def clip(handle: Any, path: Path, *args: Any) -> None:
        path.write_bytes(handle.read())

    monkeypatch.setattr(reader, "clip", clip)
    period = Period(date(2023, 1, 1), date(2023, 12, 31))
    granules = reader._download("HLSL30_VI", "2.0", (-103, 40, -102, 41), period)
    assert len(granules) == 12
    assert all(g.qa_path and g.qa_path.is_file() for g in granules)
    assert not reader._download("HLSL30_VI", "2.0", (-103, 40, -102, 41), date(2022, 1, 1))
    monkeypatch.setattr(earthaccess, "search_data", lambda **kw: [result] * 513)
    with pytest.raises(GranuleAccessError, match="budget"):
        reader._download("HLSL30_VI", "2.0", (-103, 40, -102, 41), None)
    monkeypatch.setattr(earthaccess, "login", lambda **kw: SimpleNamespace(authenticated=False))
    with pytest.raises(GranuleAccessError, match="authentication"):
        reader._download("SPL4SMGP", "008", (-103, 40, -102, 41), period)
    monkeypatch.setattr(EarthaccessGranuleReader, "_download", lambda *a: [])
    assert reader._download("NASADEM_HGT", "001", (-103, 40, -102, 41), None) == []


def test_pipeline_cli(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import sys
    from collections.abc import AsyncIterator
    from contextlib import asynccontextmanager

    state = SimpleNamespace(
        spatial=SimpleNamespace(source=SimpleNamespace(reader=SimpleNamespace(_credentials={}))),
        bundle_adapters=[],
    )

    @asynccontextmanager
    async def lifespan(app: Any) -> AsyncIterator[None]:
        yield

    app = SimpleNamespace(state=state, router=SimpleNamespace(lifespan_context=lifespan))
    monkeypatch.setattr(demo, "create_app", lambda s: app)
    captured: list[str] = []

    async def build(hero: Hero, *args: Any, **kw: Any) -> dict[str, Any]:
        captured.append(hero.id)
        return {}

    monkeypatch.setattr(demo, "build_field", build)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "build_demo",
            "--cache",
            str(tmp_path / "cache"),
            "--output",
            str(tmp_path / "output"),
            "--only",
            "akron-proof-1",
        ],
    )
    demo.main()
    assert captured == ["akron-proof-1"]
    assert (tmp_path / "output/index.json").is_file()
    monkeypatch.setattr(sys, "argv", ["build_demo", "--cache", str(tmp_path), "--server-days", "0"])
    with pytest.raises(SystemExit):
        demo.main()
