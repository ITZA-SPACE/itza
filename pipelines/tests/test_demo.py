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

import build_demo as demo
from build_demo import Hero, LiveSource, Manifest
from capture_fixtures import Archive, digest

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
        spatial=spatial,
        cache=spatial.cache,
        context=ContextFixture(),
        bundle_adapters=[],
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
            "ndvi",
            "1",
            [0.5] * 730,
            date(2022, 1, 1),
            end,
            "synthetic",
            "synthetic",
            250,
            "synthetic",
        )
    )
    model = StressModel(ROOT / "services/science-api/models/stress-v1")
    bundle = demo.merge_bundle(server_bundle(hero), {"series": series})
    result = demo.predict_seasons(bundle, start, end, model)["seasons"][0]
    assert result["prediction"] == pytest.approx(
        result["expected_value"] + sum(d["shap_value"] for d in result["drivers"])
    )
    assert any(p["period"] == "2022-01-01/2022-06-30" for p in result["input_provenance"])
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
        context=SimpleNamespace(),
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


def test_recorded_public_sources_offline() -> None:
    recorded = ROOT / "fixtures/demo/recorded"
    records = [json.loads(p.read_text()) for p in recorded.glob("*.json")]
    archive = Archive(recorded, offline=True)
    for record in records:
        payload = archive.get(record["url"], record["params"])
        assert digest(payload) == record["sha256"]
        assert len(payload) == record["bytes"]
    power = next(r for r in records if r["url"] == demo.POWER)
    weather = demo.power_series(
        archive.json(power["url"], power["params"]), date(2023, 1, 1), date(2023, 1, 3)
    )
    assert len(weather) == 7
    assert all(len(s["values"]) == 3 for s in weather)
    ndvi = next(r for r in records if r["params"].get("band") == "250m_16_days_NDVI")
    qa = next(r for r in records if r["params"].get("band") == "250m_16_days_pixel_reliability")
    vegetation = demo.modis_series(
        [archive.json(ndvi["url"], ndvi["params"])],
        [archive.json(qa["url"], qa["params"])],
        date(2008, 1, 1),
        date(2008, 6, 30),
    )
    assert 0 < sum(v is not None for v in vegetation["values"]) <= 10
    hero = Manifest.model_validate(
        yaml.safe_load((ROOT / "pipelines/hero_fields.yaml").read_text())
    ).fields[1]
    cdl = next(r for r in records if "exportImage" in r["url"])
    label = demo.cdl_label(archive.get(cdl["url"], cdl["params"]), hero, 2023)
    assert label["label"] == "crop"
    assert label["fraction"] == 1
    assert set(label["histogram"]) == {"24"}


def test_batch_context_uses_the_sdk_scalar_sort_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import earthaccess
    from cmr.queries import GranuleQuery
    from itza_science.adapters.context_archive import Search
    from itza_science.adapters.granules import GranuleAccessError

    monkeypatch.setattr(earthaccess, "login", lambda **kw: SimpleNamespace(authenticated=True))

    class Result(dict[str, Any]):
        def data_links(self, **kw: Any) -> list[str]:
            return ["https://example.test/context.h5", "https://example.test/context.xml"]

    record = Result(
        umm={
            "GranuleUR": "synthetic-context",
            "TemporalExtent": {"SingleDateTime": "2026-10-01T00:00:00Z"},
        }
    )

    def search(**kwargs: Any) -> list[Result]:
        GranuleQuery().sort_key(kwargs["sort_key"])
        return [record, record]

    monkeypatch.setattr(earthaccess, "search_data", search)
    path = tmp_path / "context.h5"
    path.write_bytes(b"synthetic test file")
    monkeypatch.setattr(earthaccess, "download", lambda *a, **kw: [str(path)])
    query = Search(
        "synthetic", "1", (-103, 40, -102, 41), Period(date(2026, 1, 1), date(2026, 12, 31)), 1
    )
    scenes, truncated = demo.BatchContextArchive._download(query, str(tmp_path))
    assert truncated
    assert len(scenes) == 1
    assert scenes[0].day == date(2026, 10, 1)
    assert list(scenes[0].assets) == ["context.h5"]
    old = Search("synthetic", "1", query.bbox, Period(date(2025, 1, 1), date(2025, 12, 31)), 1)
    assert demo.BatchContextArchive._download(old, str(tmp_path))[0] == []
    monkeypatch.setattr(earthaccess, "download", lambda *a, **kw: [])
    with pytest.raises(GranuleAccessError, match="incomplete"):
        demo.BatchContextArchive._download(query, str(tmp_path))
    monkeypatch.setattr(earthaccess, "login", lambda **kw: SimpleNamespace(authenticated=False))
    with pytest.raises(GranuleAccessError, match="authentication"):
        demo.BatchContextArchive._download(query, str(tmp_path))


@pytest.mark.parametrize("flag_location", ["root", "nested"])
def test_nisar_clip_preserves_native_service_statistics(
    hero: Hero, tmp_path: Path, flag_location: str
) -> None:
    import h5py
    from itza_science.context.rasters import NISAR_ROOT, nisar
    from itza_science.core.field import to_shapely

    path = tmp_path / "native.h5"
    with h5py.File(path, "w") as file:
        group = file.require_group(NISAR_ROOT)
        group.create_dataset("xCoordinates", data=np.linspace(-103.166, -103.150, 9))
        group.create_dataset("yCoordinates", data=np.linspace(40.160, 40.144, 9))
        group.create_dataset("projection", data=4326)
        values = group.create_dataset("soilMoisture", data=0.2 + np.arange(81).reshape(9, 9) / 1000)
        values.attrs["_FillValue"] = -9999.0
        values.attrs["scale_factor"] = 1.0
        flags = np.zeros((9, 9), dtype="uint8")
        flags[3, 4] = 1
        group.create_dataset("retrievalQualityFlag", data=flags)
        group.create_dataset(
            "ancillaryData/surfaceQualityFlag", data=np.zeros((9, 9), dtype="uint8")
        )
    clipped = tmp_path / "clipped.h5"
    field = to_shapely(hero.geometry)
    original = nisar(path, field)
    assert original is not None
    if flag_location == "root":
        with h5py.File(path, "r+") as file:
            file[NISAR_ROOT].move("ancillaryData/surfaceQualityFlag", "surfaceQualityFlag")
    with path.open("rb") as handle:
        demo.clip_nisar(handle, clipped, field.bounds)
    result = nisar(clipped, field)
    assert original is not None and result is not None
    before, after = original.stats(field, "m3/m3"), result.stats(field, "m3/m3")
    assert before is not None and after is not None
    assert after[0].model_dump() == pytest.approx(before[0].model_dump())
    assert after[1].model_dump() == before[1].model_dump()
    with path.open("rb") as handle, pytest.raises(ValueError, match="overlap"):
        demo.clip_nisar(handle, clipped, (0, 0, 0.001, 0.001))


@pytest.mark.parametrize("product", ["NISAR-synthetic", "SPL4SMGP"])
def test_batch_context_caches_native_windows(
    product: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import earthaccess
    from itza_science.adapters.context_archive import Search

    class Result(dict[str, Any]):
        def data_links(self, **kwargs: Any) -> list[str]:
            return ["https://example.test/native.h5"]

    record = Result(
        umm={"GranuleUR": "synthetic", "TemporalExtent": {"SingleDateTime": "2026-10-01"}}
    )
    monkeypatch.setattr(earthaccess, "login", lambda **kw: SimpleNamespace(authenticated=True))
    monkeypatch.setattr(earthaccess, "search_data", lambda **kw: [record])
    raw = tmp_path / "source.h5"
    raw.write_bytes(b"synthetic")
    calls: list[str] = []

    def opened(*args: Any, **kwargs: Any) -> list[Any]:
        calls.append("read")
        return [raw.open("rb")]

    def clip(handle: Any, path: Path, *args: Any) -> None:
        path.write_bytes(handle.read())

    monkeypatch.setattr(earthaccess, "open", opened)
    monkeypatch.setattr(demo, "clip_nisar", clip)
    monkeypatch.setattr(demo.ClippedReader, "clip", clip)
    query = Search(product, "1", (-103, 40, -102, 41), None, 1)
    first = demo.BatchContextArchive._download(query, str(tmp_path))
    second = demo.BatchContextArchive._download(query, str(tmp_path))
    assert first == second
    assert len(calls) == 1
    assert next(iter(first[0][0].assets.values())).read_bytes() == b"synthetic"


def test_context_summaries_keep_independent_provenance_and_gaps(hero: Hero) -> None:
    bundle = FieldBundle.model_validate(server_bundle(hero))
    context = {
        "grace": {"status": "ok", "trend_cm_per_year": -0.3, "provenance": {"source": "synthetic"}},
        "gedi": {
            "status": "ok",
            "on_field_count": 3,
            "cover_mean_fraction": 0.5,
            "height_mean_m": None,
            "provenance": [{"source": "synthetic"}],
        },
        "nisar": {"status": "ok", "scenes": [{"date": "2026-10-01", "href": "assets/test.png"}]},
    }
    demo.add_context(bundle, context)
    assert bundle.context["grace_tws_trend_cm_per_yr"] == -0.3
    assert bundle.context["gedi_footprints"] == 3
    assert bundle.context["gedi_cover_mean_fraction"] == 0.5
    assert bundle.layers.nisar is not None
    demo.add_context(
        bundle,
        {"grace": {"status": "empty"}, "gedi": {"status": "empty"}, "nisar": {"status": "empty"}},
    )
    assert not bundle.context
    assert bundle.layers.nisar is None
    assert {g.var for g in bundle.gaps} >= {"grace", "gedi", "nisar"}


@pytest.mark.parametrize("product", ["GEDI02_A", "GEDI02_B"])
def test_gedi_clip_preserves_service_shots(product: str, hero: Hero, tmp_path: Path) -> None:
    import h5py
    from itza_science.context.gedi import read_gedi
    from itza_science.core.field import to_shapely

    native, clipped = tmp_path / "gedi.h5", tmp_path / "clip.h5"
    prefix = "" if product == "GEDI02_A" else "geolocation/"
    with h5py.File(native, "w") as file:
        file.create_group("METADATA")
        beam = file.create_group("BEAM0000")
        beam.create_dataset(prefix + "lat_lowestmode", data=[40.15, 40.152, 41, 40.15])
        beam.create_dataset(prefix + "lon_lowestmode", data=[-103.16, -103.158, -102.2, -103.157])
        beam.create_dataset(prefix + "degrade_flag", data=[0, 0, 0, 0])
        beam.create_dataset(prefix + "delta_time", data=[250000000] * 4)
        beam.create_dataset(
            "quality_flag" if product == "GEDI02_A" else "l2b_quality_flag", data=[1, 1, 1, 0]
        )
        beam.create_dataset("sensitivity", data=[0.95] * 4)
        beam.create_dataset("shot_number", data=[100, 101, 102, 103])
        beam.create_dataset(
            "rh" if product == "GEDI02_A" else "cover",
            data=np.full((4, 101), 12.0) if product == "GEDI02_A" else [0.4] * 4,
        )
    field = to_shapely(hero.geometry)
    with native.open("rb") as handle:
        demo.clip_gedi(handle, clipped, (-103.18, 40.13, -103.14, 40.17), product)
    original, limited = read_gedi(native, field, product), read_gedi(clipped, field, product)
    assert original == limited
    assert len(limited[0]) == 2


def test_native_grace_retains_real_irregular_solution_dates() -> None:
    import math
    from collections import Counter

    from itza_science.context.grace import read_grace

    root = ROOT / "fixtures/demo/grace"
    metadata = json.loads((root / "manifest.json").read_text())
    path = root / "native-cell.nc"
    assert digest(path.read_bytes()) == metadata["sha256"]
    with pytest.raises(ValueError, match="duplicate months"):
        read_grace(path, 36.11965, 5.7295)
    response = demo.native_grace(path, 36.11965, 5.7295)
    assert response.status == "ok"
    assert response.provenance is not None
    assert response.provenance.resolution_m == 300000
    assert response.trend_cm_per_year is not None and math.isfinite(response.trend_cm_per_year)
    observed = [p for p in response.series if p.anomaly_cm is not None]
    months = Counter((p.date.year, p.date.month) for p in observed)
    assert max(months.values()) > 1
    assert len({p.date for p in observed}) == len(observed)
    assert any(p.anomaly_cm is None for p in response.series)


def test_context_falls_back_to_native_grace_dates(
    source: LiveSource, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from itza_science.adapters.context_archive import Scene
    from itza_science.context.models import GraceResponse

    manifest = Manifest.model_validate(
        yaml.safe_load((ROOT / "pipelines/hero_fields.yaml").read_text())
    )
    story = manifest.fields[0]

    async def duplicate(query: Any) -> GraceResponse:
        raise ValueError("GRACE record has duplicate months")

    async def read(query: Any, decode: Any) -> GraceResponse:
        scene = Scene(
            "recorded-grace",
            date(2026, 9, 1),
            {"data.nc": ROOT / "fixtures/demo/grace/native-cell.nc"},
        )
        return GraceResponse.model_validate(decode([scene], False))

    monkeypatch.setattr(source.state.context, "_grace", duplicate)
    source.state.context.archive = SimpleNamespace(read=read)
    response = asyncio.run(source.context(story, date(2008, 1, 1), date(2025, 12, 31), tmp_path))
    assert response["grace"]["status"] == "ok"
    assert response["grace"]["trend_cm_per_year"] is not None
    assert "native solution dates" in response["grace"]["provenance"]["method"]


STORE_FILES = {
    "derived/smap-l4/v8-clips": {"setif/a.h5": b"smap-one", "akron/a.h5": b"smap-two"},
    "derived/gpm-imerg/v07-clips": {"setif/b.nc4": b"imerg-one"},
}


def store_manifest(tmp_path: Path, sha_override: dict[str, str] | None = None) -> Path:
    sets = []
    for set_id, source, version, prefix in (
        ("smap-l4-spl4smgp", "smap-l4", "v8-clips", "derived/smap-l4/v8-clips"),
        ("imerg-final-daily", "gpm-imerg", "v07-clips", "derived/gpm-imerg/v07-clips"),
        ("grace-mascon-rl06-3", "grace-mascon", "rl06.3", "raw/grace-mascon/rl06.3"),
    ):
        files = (
            [
                {"path": name, "sha256": (sha_override or {}).get(name, digest(body))}
                for name, body in STORE_FILES.get(prefix, {}).items()
            ]
            if set_id != "grace-mascon-rl06-3"
            else []
        )
        sets.append(
            {
                "id": set_id,
                "kind": prefix.split("/")[0],
                "source": source,
                "version": version,
                "status": "synced" if set_id != "grace-mascon-rl06-3" else "planned",
                "files": files,
            }
        )
    path = tmp_path / "manifest.yaml"
    path.write_text(yaml.safe_dump({"sets": sets}))
    return path


def write_store(root: Path) -> None:
    for prefix, files in STORE_FILES.items():
        for name, body in files.items():
            target = root / prefix / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)


def test_store_verification_counts_every_checked_clip(tmp_path: Path) -> None:
    store = tmp_path / "store"
    write_store(store)
    assert demo.verify_store(store, store_manifest(tmp_path)) == 3


def test_store_verification_allows_files_that_were_not_pulled(tmp_path: Path) -> None:
    store = tmp_path / "store"
    write_store(store)
    (store / "derived/smap-l4/v8-clips/akron/a.h5").unlink()
    assert demo.verify_store(store, store_manifest(tmp_path)) == 2
    assert demo.verify_store(tmp_path / "nothing", store_manifest(tmp_path)) == 0


def test_store_verification_aborts_on_a_damaged_clip(tmp_path: Path) -> None:
    store = tmp_path / "store"
    write_store(store)
    (store / "derived/gpm-imerg/v07-clips/setif/b.nc4").write_bytes(b"truncated")
    with pytest.raises(ValueError, match="checksum mismatch for setif/b.nc4"):
        demo.verify_store(store, store_manifest(tmp_path))


def test_store_verification_aborts_on_a_file_the_manifest_does_not_list(tmp_path: Path) -> None:
    store = tmp_path / "store"
    write_store(store)
    (store / "derived/smap-l4/v8-clips/setif/extra.h5").write_bytes(b"x")
    with pytest.raises(ValueError, match="not in the manifest"):
        demo.verify_store(store, store_manifest(tmp_path))
    (store / "derived/smap-l4/v8-clips/setif/extra.h5").unlink()
    (store / "derived/smap-l4/v8-clips/setif/half.h5.part").write_bytes(b"x")
    assert demo.verify_store(store, store_manifest(tmp_path)) == 3  # unfinished parts are ignored


def test_the_committed_manifest_matches_the_store_layout() -> None:
    ids = {e["id"] for e in yaml.safe_load(demo.STORE_MANIFEST.read_text())["sets"]}
    assert set(demo.STORE_SETS) <= ids


def test_pipeline_reads_the_store_for_smap_and_imerg_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sys
    from collections.abc import AsyncIterator
    from contextlib import asynccontextmanager

    from itza_science.adapters.dataset_store import StoreGranuleReader
    from itza_science.adapters.hls_vi import HlsViAdapter
    from itza_science.adapters.imerg import ImergAdapter
    from itza_science.adapters.smap_l4 import SmapL4Adapter

    store = tmp_path / "store"
    write_store(store)
    monkeypatch.setattr(demo, "STORE_MANIFEST", store_manifest(tmp_path))
    placeholder = SimpleNamespace()
    adapters = [ImergAdapter(placeholder), SmapL4Adapter(placeholder), HlsViAdapter(placeholder)]
    state = SimpleNamespace(
        context=SimpleNamespace(),
        spatial=SimpleNamespace(source=SimpleNamespace(reader=SimpleNamespace(_credentials={}))),
        bundle_adapters=adapters,
    )

    @asynccontextmanager
    async def lifespan(app: Any) -> AsyncIterator[None]:
        yield

    app = SimpleNamespace(state=state, router=SimpleNamespace(lifespan_context=lifespan))
    monkeypatch.setattr(demo, "create_app", lambda s: app)

    async def build(hero: Hero, *args: Any, **kw: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(demo, "build_field", build)
    monkeypatch.setattr(
        sys,
        "argv",
        ["build_demo", "--cache", str(tmp_path / "cache"), "--output", str(tmp_path / "out")]
        + ["--only", "akron-proof-1", "--store", str(store)],
    )
    demo.main()
    readers = [getattr(a, "_reader") for a in adapters]  # noqa: B009
    assert isinstance(readers[0], StoreGranuleReader)
    assert isinstance(readers[1], StoreGranuleReader)
    assert isinstance(readers[2], demo.ClippedReader)
    assert readers[0] is readers[1]
