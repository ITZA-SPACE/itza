import httpx
import pytest
import respx

from itza_science.clients.http import USER_AGENT, UpstreamClient, build_client
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError

pytestmark = [pytest.mark.unit, pytest.mark.anyio]

URL = "https://upstream.test/data"
SETTINGS = Settings(upstream_retries=2, upstream_backoff_s=0)


async def _get() -> dict[str, object]:
    async with build_client(SETTINGS) as client:
        return await UpstreamClient(client, SETTINGS).get_json("src", URL, {"a": 1})


@respx.mock
async def test_sends_descriptive_user_agent_and_params() -> None:
    route = respx.get(URL).mock(return_value=httpx.Response(200, json={"ok": True}))
    assert await _get() == {"ok": True}
    request = route.calls.last.request
    assert request.headers["user-agent"] == USER_AGENT
    assert request.url.params["a"] == "1"


@respx.mock
async def test_retries_transient_status_then_succeeds() -> None:
    route = respx.get(URL).mock(
        side_effect=[httpx.Response(503), httpx.Response(429), httpx.Response(200, json={"ok": 1})]
    )
    assert await _get() == {"ok": 1}
    assert route.call_count == 3


@respx.mock
async def test_gives_up_after_retries_on_transport_error() -> None:
    route = respx.get(URL).mock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(UpstreamError, match="after 3 attempts"):
        await _get()
    assert route.call_count == 3


@respx.mock
async def test_client_error_is_not_retried() -> None:
    route = respx.get(URL).mock(return_value=httpx.Response(404))
    with pytest.raises(UpstreamError, match="HTTP 404"):
        await _get()
    assert route.call_count == 1


@respx.mock
@pytest.mark.parametrize("body", [b"not json", b"[1, 2]"])
async def test_rejects_non_object_json(body: bytes) -> None:
    respx.get(URL).mock(return_value=httpx.Response(200, content=body))
    with pytest.raises(UpstreamError):
        await _get()
