import json
from collections.abc import Callable
from datetime import date
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import pytest
from PIL import Image
from shapely.geometry import Polygon

from itza_science.terrain.grid import Grid
from itza_science.terrain.models import Source
from itza_science.terrain.relief import ReliefGrid
from itza_science.terrain.relief_sources import (
    EoxImagerySource,
    TerrariumElevationSource,
    UsgsReliefSource,
    _tile,
    build_relief,
    is_blank,
)
from itza_science.terrain.sources import Inputs
from tests.spatial_support import FixtureSpatialSource, proof

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

FIXTURES = Path(__file__).parents[5] / "fixtures" / "relief"
GRID_64 = ReliefGrid((-103.1729, 40.1654, -103.1662, 40.1705), 64, 64, (570.0, 567.0))
GRID_16 = ReliefGrid((5.726, 36.117, 5.733, 36.122), 16, 16, (630.0, 555.0))
Handler = Callable[[httpx.Request], httpx.Response]


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def routes(
    *,
    dem: httpx.Response | None = None,
    dem_catalog: httpx.Response | None = None,
    image: httpx.Response | None = None,
    image_catalog: httpx.Response | None = None,
    seen: list[httpx.Request] | None = None,
) -> Handler:
    table = {
        ("elevation.nationalmap.gov", "exportImage"): dem,
        ("elevation.nationalmap.gov", "query"): dem_catalog,
        ("imagery.nationalmap.gov", "exportImage"): image,
        ("imagery.nationalmap.gov", "query"): image_catalog,
    }

    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return table[(request.url.host, request.url.path.rsplit("/", 1)[-1])] or httpx.Response(404)

    return handle


def tiff(name: str) -> httpx.Response:
    return httpx.Response(200, content=fixture(name), headers={"content-type": "image/tiff"})


def jpeg(content: bytes) -> httpx.Response:
    return httpx.Response(200, content=content, headers={"content-type": "image/jpeg"})


def catalog(name: str) -> httpx.Response:
    return httpx.Response(200, json=json.loads(fixture(name)))


def usgs(handler: Handler) -> UsgsReliefSource:
    return UsgsReliefSource(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def plain(colour: tuple[int, int, int]) -> bytes:
    out = BytesIO()
    Image.new("RGB", (8, 8), colour).save(out, "JPEG")
    return out.getvalue()


async def test_elevation_reads_3dep_fixture_with_lidar_provenance() -> None:
    seen: list[httpx.Request] = []
    source = usgs(
        routes(
            dem=tiff("akron-3dep-64.tif"), dem_catalog=catalog("akron-3dep-catalog.json"), seen=seen
        )
    )
    result = await source.elevation(GRID_64)
    assert result is not None
    values, proof = result
    assert values.shape == (64, 64)
    assert 1380 < values.min() < values.max() < 1420
    assert (proof.source, proof.product) == ("USGS", "3DEP")
    assert proof.version == "CO_CentralEasternPlains_2020_D20"
    assert proof.resolution_m == 1
    assert proof.coarse is False
    assert (proof.period.start, proof.period.end) == (date(2020, 5, 9), date(2020, 9, 7))
    export = seen[0].url.params
    assert export["bbox"] == "-103.1729,40.1654,-103.1662,40.1705"
    assert (export["bboxSR"], export["imageSR"], export["size"]) == ("4326", "4326", "64,64")
    assert (export["format"], export["pixelType"], export["f"]) == ("tiff", "F32", "image")
    assert seen[1].url.params["where"] == "Category=1"


async def test_constant_raster_is_no_coverage() -> None:
    source = usgs(
        routes(dem=tiff("constant-zero-16.tif"), dem_catalog=catalog("akron-3dep-catalog.json"))
    )
    assert await source.elevation(GRID_16) is None


async def test_json_error_body_is_no_coverage() -> None:
    source = usgs(routes(dem=httpx.Response(200, json={"error": {"code": 400}})))
    assert await source.elevation(GRID_64) is None


async def test_damaged_tiff_and_wrong_size_are_no_coverage() -> None:
    broken = httpx.Response(200, content=b"II*\x00junk", headers={"content-type": "image/tiff"})
    assert await usgs(routes(dem=broken)).elevation(GRID_64) is None
    source = usgs(
        routes(dem=tiff("akron-3dep-64.tif"), dem_catalog=catalog("akron-3dep-catalog.json"))
    )
    assert await source.elevation(GRID_16) is None


async def test_timeout_and_server_error_are_no_coverage() -> None:
    calls: list[str] = []

    def timeout(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        raise httpx.ReadTimeout("slow", request=request)

    assert await usgs(timeout).elevation(GRID_64) is None
    # The export and its catalog lookup run together, and each is tried twice.
    assert len(calls) == 4
    assert await usgs(routes(dem=httpx.Response(500))).elevation(GRID_64) is None


@pytest.mark.parametrize(
    "features",
    [
        None,
        [],
        [{"attributes": {"Name": "x", "LowPS": 1, "StartDate": None, "EndDate": "20200907"}}],
        [{"attributes": {"Name": "x", "LowPS": 1, "StartDate": 20210101, "EndDate": "20200907"}}],
        [{"attributes": {"Name": "x", "LowPS": 1, "StartDate": 20201350, "EndDate": "bad"}}],
        [{"attributes": {"Name": "x", "LowPS": None}}, "not a feature"],
    ],
)
async def test_elevation_without_provenance_is_no_coverage(features: list[object] | None) -> None:
    body = (
        httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
        if features is None
        else httpx.Response(200, json={"features": features})
    )
    source = usgs(routes(dem=tiff("akron-3dep-64.tif"), dem_catalog=body))
    assert await source.elevation(GRID_64) is None


async def test_ten_metre_elevation_is_not_coarse_but_thirty_is() -> None:
    def with_cell(cell: float) -> httpx.Response:
        item = {"Name": "n41w104", "LowPS": cell, "StartDate": 19480101, "EndDate": "20200907"}
        return httpx.Response(200, json={"features": [{"attributes": item}]})

    for cell, coarse in ((10, False), (30.9, True)):
        source = usgs(routes(dem=tiff("akron-3dep-64.tif"), dem_catalog=with_cell(cell)))
        result = await source.elevation(GRID_64)
        assert result is not None
        assert result[1].coarse is coarse


async def test_imagery_reads_naip_fixture() -> None:
    seen: list[httpx.Request] = []
    source = usgs(
        routes(
            image=jpeg(fixture("akron-naip-64.jpg")),
            image_catalog=catalog("akron-naip-catalog.json"),
            seen=seen,
        )
    )
    result = await source.imagery(GRID_64)
    assert result is not None
    content, proof = result
    assert content.startswith(b"\xff\xd8")
    assert (proof.source, proof.product) == ("USDA", "NAIP")
    assert proof.version == "m_4010355_se_13_060_20190914"
    assert proof.period.start == proof.period.end == date(2019, 9, 14)
    assert proof.resolution_m == pytest.approx(GRID_64.cell_m)
    assert seen[0].url.params["format"] == "jpg"


async def test_blank_or_undated_imagery_is_no_coverage() -> None:
    blank = usgs(
        routes(image=jpeg(plain((0, 0, 0))), image_catalog=catalog("akron-naip-catalog.json"))
    )
    assert await blank.imagery(GRID_64) is None
    undated = usgs(
        routes(
            image=jpeg(fixture("akron-naip-64.jpg")),
            image_catalog=httpx.Response(200, json={"features": [{"attributes": {"Name": "x"}}]}),
        )
    )
    assert await undated.imagery(GRID_64) is None
    assert await usgs(routes(image=httpx.Response(200, json={}))).imagery(GRID_64) is None


def test_is_blank() -> None:
    assert is_blank(b"not an image")
    assert is_blank(plain((12, 12, 12)))
    assert not is_blank(fixture("akron-naip-64.jpg"))


AKRON_1 = Polygon(
    [
        (-103.17086256247813, 40.16678544374368),
        (-103.16802791867501, 40.166946897345056),
        (-103.16824213938182, 40.169082956355155),
        (-103.17107686725595, 40.168921497752535),
    ]
)
EOX_PROOF = proof(date(2016, 1, 1), "s2cloudless", 10)


class Primary:
    def __init__(self, *, elevation: bool = True, imagery: bool = True) -> None:
        self.has_elevation, self.has_imagery = elevation, imagery

    async def elevation(self, grid: ReliefGrid) -> tuple[np.ndarray, Source] | None:
        if not self.has_elevation:
            return None
        rows = np.linspace(1400, 1390, grid.height)[:, None]
        return np.broadcast_to(rows, (grid.height, grid.width)).copy(), proof(
            date(2020, 5, 9), "3DEP", 1
        )

    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None:
        return (
            (fixture("akron-naip-64.jpg"), proof(date(2019, 9, 14), "NAIP", 1))
            if (self.has_imagery)
            else None
        )


class Mosaic:
    def __init__(self, available: bool = True) -> None:
        self.available = available

    async def imagery(self, grid: ReliefGrid) -> tuple[bytes, Source] | None:
        return (fixture("eox-tile.jpg"), EOX_PROOF) if self.available else None


class NoDem(FixtureSpatialSource):
    async def dem(self, grid: Grid) -> Inputs:
        return Inputs()


class OffGridDem(FixtureSpatialSource):
    async def dem(self, grid: Grid) -> Inputs:
        return Inputs(
            elevation=np.full(grid.shape, np.nan), dem_source=proof(date(2000, 2, 11), "DEM")
        )


async def test_build_prefers_primary() -> None:
    relief = await build_relief(AKRON_1, Primary(), FixtureSpatialSource(), Mosaic())
    assert relief is not None
    assert relief.elevation.shape == (relief.grid.height, relief.grid.width)
    assert relief.elevation_source.product == "3DEP"
    assert relief.imagery_source is not None
    assert relief.imagery_source.product == "NAIP"
    assert relief.gaps == []


async def test_build_falls_back_to_coarse_dem() -> None:
    relief = await build_relief(AKRON_1, Primary(elevation=False), FixtureSpatialSource(), Mosaic())
    assert relief is not None
    assert relief.elevation.shape == (relief.grid.height, relief.grid.width)
    assert relief.elevation_source.product == "synthetic-DEM"
    assert relief.elevation_source.coarse is True
    # The fixture DEM falls 3 m per 30 m cell to the east: the fine grid keeps that slope.
    finite = relief.elevation[np.isfinite(relief.elevation).all(axis=1)]
    assert finite.size
    assert np.all(np.diff(finite[0, ::30]) < 0)
    assert [(g.var, g.severity.value) for g in relief.gaps] == [("elevation", "info")]


async def test_build_falls_back_to_eox_imagery() -> None:
    relief = await build_relief(AKRON_1, Primary(imagery=False), FixtureSpatialSource(), Mosaic())
    assert relief is not None
    assert relief.imagery_source == EOX_PROOF
    assert [g.var for g in relief.gaps] == ["imagery"]


async def test_build_without_any_imagery_still_has_relief() -> None:
    relief = await build_relief(
        AKRON_1, Primary(imagery=False), FixtureSpatialSource(), Mosaic(available=False)
    )
    assert relief is not None
    assert relief.imagery_jpeg is None
    assert relief.imagery_source is None
    assert "No picture" in relief.gaps[0].reason


@pytest.mark.parametrize("dem", [NoDem(), OffGridDem()])
async def test_build_without_any_elevation_is_none(dem: FixtureSpatialSource) -> None:
    assert await build_relief(AKRON_1, Primary(elevation=False), dem, Mosaic()) is None


def eox(handler: Handler) -> EoxImagerySource:
    return EoxImagerySource(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_eox_mosaic_covers_grid() -> None:
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return jpeg(fixture("eox-tile.jpg"))

    grid = ReliefGrid((5.726, 36.117, 5.733, 36.122), 630, 555, (630.0, 555.0))
    result = await eox(handle).imagery(grid)
    assert result is not None
    content, source = result
    with Image.open(BytesIO(content)) as image:
        assert image.size == (630, 555)
        # Every pixel comes from a tile: none is left at the black fill value.
        assert np.asarray(image.convert("L")).min() > 0
    assert (source.product, source.version, source.coarse) == ("s2cloudless", "2016", True)
    assert seen
    assert all(path.startswith("/wmts/1.0.0/s2cloudless_3857/default/g/15/") for path in seen)
    assert "/wmts/1.0.0/s2cloudless_3857/default/g/15/12854/16905.jpg" in seen


async def test_eox_refuses_more_than_16_tiles() -> None:
    grid = ReliefGrid((5.70, 36.10, 5.78, 36.16), 1024, 900, (7200.0, 6660.0))
    assert await eox(lambda request: jpeg(fixture("eox-tile.jpg"))).imagery(grid) is None


@pytest.mark.parametrize(
    "response",
    [httpx.Response(404), httpx.Response(200, content=b"nope"), jpeg(plain((0, 0, 0)))],
)
async def test_eox_failed_or_blank_tile_is_no_coverage(response: httpx.Response) -> None:
    grid = ReliefGrid((5.726, 36.117, 5.733, 36.122), 64, 56, (630.0, 555.0))
    assert await eox(lambda request: response).imagery(grid) is None


def test_tile_index_matches_the_captured_tile() -> None:
    # fixtures/relief/eox-tile.jpg is tile 15/12854/16905 (row 12854, column 16905).
    assert _tile(5.7295, 36.1197, 15) == (16905, 12854)


async def test_one_dropped_request_is_retried() -> None:
    dropped: list[str] = []
    table = routes(dem=tiff("akron-3dep-64.tif"), dem_catalog=catalog("akron-3dep-catalog.json"))

    def flaky(request: httpx.Request) -> httpx.Response:
        if request.url.path not in dropped:
            dropped.append(request.url.path)
            raise httpx.ConnectError("reset", request=request)
        return table(request)

    assert await usgs(flaky).elevation(GRID_64) is not None
    assert len(dropped) == 2


SETIF_GRID = ReliefGrid((5.726, 36.117, 5.733, 36.122), 630, 555, (630.0, 555.0))


def terrarium(handler: Handler) -> TerrariumElevationSource:
    return TerrariumElevationSource(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def png(content: bytes) -> httpx.Response:
    return httpx.Response(200, content=content, headers={"content-type": "image/png"})


async def test_terrarium_reads_real_tile_onto_the_grid() -> None:
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return png(fixture("terrarium-tile.png"))

    result = await terrarium(handle).elevation(SETIF_GRID)
    assert result is not None
    values, source = result
    assert values.shape == (555, 630)
    assert np.isfinite(values).all()
    # fixtures/relief/terrarium-tile.png (13/4226/3213, Sétif) spans 922 to 978 m.
    assert 922 <= values.min() < values.max() <= 978
    # Whole-metre source steps are blurred away: neighbours differ by far less than a metre.
    assert np.abs(np.diff(values, axis=1)).max() < 0.5
    assert (source.product, source.coarse, source.resolution_m) == ("Terrarium", True, 30)
    assert seen == ["/elevation-tiles-prod/terrarium/13/4226/3213.png"]


@pytest.mark.parametrize(
    "response",
    [httpx.Response(403), httpx.Response(200, content=b"nope")],
)
async def test_terrarium_failed_tile_is_no_coverage(response: httpx.Response) -> None:
    assert await terrarium(lambda request: response).elevation(SETIF_GRID) is None


async def test_terrarium_flat_sea_tile_and_wide_area_are_no_coverage() -> None:
    out = BytesIO()
    Image.new("RGB", (256, 256), (128, 0, 0)).save(out, "PNG")
    flat = out.getvalue()
    assert await terrarium(lambda request: png(flat)).elevation(SETIF_GRID) is None
    wide = ReliefGrid((5.0, 35.5, 6.0, 36.5), 1024, 1024, (90000.0, 111000.0))
    assert await terrarium(lambda request: png(flat)).elevation(wide) is None


async def test_build_uses_open_dem_when_the_30_m_model_cannot_be_read() -> None:
    class Open:
        async def elevation(self, grid: ReliefGrid) -> tuple[np.ndarray, Source] | None:
            return np.full((grid.height, grid.width), 950.0), proof(
                date(2000, 2, 11), "Terrarium", 30
            )

    relief = await build_relief(AKRON_1, Primary(elevation=False), NoDem(), Mosaic(), Open())
    assert relief is not None
    assert relief.elevation_source.product == "Terrarium"
    assert [g.var for g in relief.gaps] == ["elevation"]
    # The Earthdata 30 m model stays first choice when it can be read.
    preferred = await build_relief(
        AKRON_1, Primary(elevation=False), FixtureSpatialSource(), Mosaic(), Open()
    )
    assert preferred is not None
    assert preferred.elevation_source.product == "synthetic-DEM"
