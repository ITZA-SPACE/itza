"""CropScape CDL point-value parsing (F-22 ground truth). Fixtures are hand-authored from the
documented response shape: the live service returned HTTP 500 for every query during this
session (see `pipelines/capture_fixtures.py`), so none could be captured from a real call.
"""

from pathlib import Path

import httpx
import pytest
import respx

from itza_science.clients.cdl import BASE_URL, CdlClient, CdlLabel, classify
from itza_science.clients.http import UpstreamClient, build_client
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

SETTINGS = Settings(upstream_retries=0, upstream_backoff_s=0)
FIXTURES = Path(__file__).resolve().parents[4] / "fixtures" / "cdl"


def _text(name: str) -> str:
    return (FIXTURES / name).read_text()


async def _value(response_text: str, year: int = 2020) -> CdlLabel | None:
    async with build_client(SETTINGS) as client:
        cdl = CdlClient(UpstreamClient(client, SETTINGS))
        with respx.mock:
            respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=response_text))
            return await cdl.value_at(-103.15, 40.15, year)


async def test_parses_a_crop_year() -> None:
    label = await _value(_text("akron_wheat_2020.txt"))
    assert label is not None
    assert label.value == 24
    assert label.category == "Winter Wheat"
    assert label.classification == "crop"


async def test_parses_a_fallow_year() -> None:
    label = await _value(_text("akron_fallow_2021.txt"))
    assert label is not None
    assert label.classification == "fallow"


async def test_parses_a_non_cropland_year_as_other() -> None:
    label = await _value(_text("akron_grass_2019.txt"))
    assert label is not None
    assert label.classification == "other"


async def test_background_value_is_no_coverage() -> None:
    assert await _value(_text("no_coverage.txt")) is None


async def test_years_before_cdl_coverage_are_not_queried() -> None:
    async with build_client(SETTINGS) as client:
        cdl = CdlClient(UpstreamClient(client, SETTINGS))
        with respx.mock:
            route = respx.get(BASE_URL)
            assert await cdl.value_at(-103.15, 40.15, 2000) is None
            assert route.call_count == 0


async def test_an_unparsable_response_raises() -> None:
    async with build_client(SETTINGS) as client:
        cdl = CdlClient(UpstreamClient(client, SETTINGS))
        with respx.mock:
            respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<fault>oops</fault>"))
            with pytest.raises(UpstreamError):
                await cdl.value_at(-103.15, 40.15, 2020)


@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("Winter Wheat", "crop"),
        ("Corn", "crop"),
        ("Fallow/Idle Cropland", "fallow"),
        ("Grassland/Pasture", "other"),
        ("Developed/Low Intensity", "other"),
        ("Open Water", "other"),
        ("Background", "other"),
    ],
)
def test_classify(category: str, expected: str) -> None:
    assert classify(category) == expected
