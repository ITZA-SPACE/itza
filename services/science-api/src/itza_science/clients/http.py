"""Shared async HTTP client: timeouts, retries with backoff, descriptive User-Agent."""

import asyncio
from collections.abc import Mapping
from typing import Any

import httpx

from itza_science import __version__
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError

USER_AGENT = f"itza-science/{__version__} (NASA Space Apps 2026 Field Shift; open-source)"
_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})


def build_client(
    settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=settings.upstream_timeout_s,
        headers={"User-Agent": USER_AGENT},
        transport=transport,
    )


class UpstreamClient:
    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None:
        self._client = client
        self._retries = settings.upstream_retries
        self._backoff_s = settings.upstream_backoff_s

    async def _get(
        self, source: str, url: str, params: Mapping[str, str | int | float]
    ) -> httpx.Response:
        last_reason = "no attempt made"
        for attempt in range(self._retries + 1):
            if attempt:
                await asyncio.sleep(self._backoff_s * 2 ** (attempt - 1))
            try:
                response = await self._client.get(url, params=params)
            except httpx.TransportError as exc:
                last_reason = f"{type(exc).__name__} contacting upstream"
                continue
            if response.status_code in _RETRY_STATUS:
                last_reason = f"upstream returned HTTP {response.status_code}"
                continue
            if response.status_code >= 400:
                raise UpstreamError(source, f"upstream returned HTTP {response.status_code}")
            return response
        raise UpstreamError(source, f"{last_reason} after {self._retries + 1} attempts")

    async def get_json(
        self, source: str, url: str, params: Mapping[str, str | int | float]
    ) -> dict[str, Any]:
        response = await self._get(source, url, params)
        try:
            body = response.json()
        except ValueError as exc:
            raise UpstreamError(source, "upstream returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise UpstreamError(source, "upstream returned an unexpected JSON shape")
        return body

    async def get_text(self, source: str, url: str, params: Mapping[str, str | int | float]) -> str:
        response = await self._get(source, url, params)
        return response.text
