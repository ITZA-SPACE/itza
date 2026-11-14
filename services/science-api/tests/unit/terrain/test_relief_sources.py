import json
from collections.abc import Callable
from datetime import date
from io import BytesIO
from pathlib import Path

import httpx
import pytest
from PIL import Image

from itza_science.terrain.relief import ReliefGrid
from itza_science.terrain.relief_sources import UsgsReliefSource, is_blank

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
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    assert await usgs(timeout).elevation(GRID_64) is None
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
