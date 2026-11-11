import httpx
import pytest
import respx

from itza_science.clients.http import UpstreamClient, build_client
from itza_science.clients.power_projection import PowerProjectionClient
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError
from tests.support import load_fixture

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

SETTINGS = Settings(upstream_retries=0, upstream_backoff_s=0)
URL = f"{SETTINGS.power_base_url}/api/projection/monthly/point"


async def _fetch() -> tuple[dict[str, object], str | None]:
    async with build_client(SETTINGS) as client:
        power = PowerProjectionClient(UpstreamClient(client, SETTINGS), SETTINGS)
        return await power.fetch_future(40.15, -103.15)  # type: ignore[return-value]


@respx.mock
async def test_parses_real_response_into_monthly_means() -> None:
    body = load_fixture("projection_akron_2041_gfdl_esm4.json")
    respx.get(URL).mock(return_value=httpx.Response(200, json=body))
    climatology, version = await _fetch()
    assert version == "v2.6.4-beta"
    assert len(climatology) == 6
    tmax = climatology["gfdl_esm4"]["ssp245"]["tmax"]  # type: ignore[index]
    assert len(tmax) == 12
    assert tmax[0] == pytest.approx(1.35)
    assert set(climatology["gfdl_esm4"]["ssp126"]) == {  # type: ignore[index]
        "tmax",
        "tmin",
        "tmean",
        "precip",
        "rh",
        "wind",
        "srad",
    }


@respx.mock
async def test_fill_values_yield_empty_climatology() -> None:
    body = load_fixture("projection_setif_2041_empty.json")
    respx.get(URL).mock(return_value=httpx.Response(200, json=body))
    climatology, _ = await _fetch()
    assert climatology == {}


@respx.mock
async def test_unexpected_shape_is_an_upstream_error() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200, json={"properties": {}}))
    with pytest.raises(UpstreamError, match="expected shape"):
        await _fetch()
