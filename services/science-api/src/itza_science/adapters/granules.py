"""Earthdata granule search and download, wrapped so adapters are testable offline.

Adapters never call ``earthaccess`` directly: they ask a ``GranuleReader`` for
the granules covering a day and a bounding box. In production that is
``EarthaccessGranuleReader``; tests inject a fixture-backed fake instead, so
no test ever touches the network.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

CREDENTIAL_ENV_VARS = ("EARTHDATA_USERNAME", "EARTHDATA_PASSWORD")


@dataclass(frozen=True)
class Granule:
    """One matched granule, downloaded (or faked) to a local file."""

    path: Path
    data_date: date


class GranuleReader(Protocol):
    def credentials_available(self) -> bool: ...

    async def search_day(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date,
    ) -> list[Granule]:
        """Granules for ``short_name``/``version`` covering ``bbox`` on ``day``.

        Empty list when none are found. Never raises for "no data"; only for
        a genuine transport/credential failure the caller cannot recover
        from (callers should still catch broadly and turn it into a gap).
        """
        ...


def credentials_available() -> bool:
    return all(os.environ.get(name) for name in CREDENTIAL_ENV_VARS)


class EarthaccessGranuleReader:
    """Default reader: real Earthdata Login, CMR search and download."""

    def __init__(self, download_dir: Path) -> None:
        self._download_dir = download_dir

    def credentials_available(self) -> bool:
        return credentials_available()

    async def search_day(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date,
    ) -> list[Granule]:
        return await asyncio.to_thread(self._search_day_blocking, short_name, version, bbox, day)

    def _search_day_blocking(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date,
    ) -> list[Granule]:
        """earthaccess is synchronous; run off the event loop so jobs never stall the API."""
        import earthaccess  # noqa: PLC0415 - lazy: never imported when credentials are absent

        earthaccess.login(strategy="environment")
        results = earthaccess.search_data(
            short_name=short_name,
            version=version,
            bounding_box=bbox,
            temporal=(day.isoformat(), day.isoformat()),
        )
        if not results:
            return []
        self._download_dir.mkdir(parents=True, exist_ok=True)
        paths = earthaccess.download(results, str(self._download_dir))
        return [Granule(path=Path(path), data_date=day) for path in paths]
