"""Earthdata granule search and download, wrapped so adapters are testable offline.

Adapters never call ``earthaccess`` directly: they ask a ``GranuleReader`` for
the granules covering a day and a bounding box. In production that is
``EarthaccessGranuleReader``; tests inject a fixture-backed fake instead, so
no test ever touches the network.
"""

from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from itza_science.adapters.base import Period

CREDENTIAL_ENV_VARS = ("EARTHDATA_USERNAME", "EARTHDATA_PASSWORD")
_AUTH_LOCK = threading.Lock()
_MAX_GRANULES_PER_DAY = 64


class GranuleAccessError(Exception):
    """Sanitized source-access failure; upstream exceptions may contain secrets."""


@dataclass(frozen=True)
class Granule:
    """One matched granule, downloaded (or faked) to a local file."""

    path: Path
    data_date: date
    qa_path: Path | None = None


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
    return bool(os.environ.get("EARTHDATA_TOKEN")) or all(
        os.environ.get(name) for name in CREDENTIAL_ENV_VARS
    )


class EarthaccessGranuleReader:
    """Default reader: real Earthdata Login, CMR search and download."""

    def __init__(self, download_dir: Path, credentials: dict[str, str] | None = None) -> None:
        self._download_dir = download_dir
        self._credentials = credentials or {}

    def credentials_available(self) -> bool:
        return (
            bool(self._credentials.get("EARTHDATA_TOKEN"))
            or all(self._credentials.get(name) for name in CREDENTIAL_ENV_VARS)
            or credentials_available()
        )

    async def search_day(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date,
    ) -> list[Granule]:
        return await asyncio.to_thread(self._search_day_blocking, short_name, version, bbox, day)

    async def search_period(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        period: Period | None,
    ) -> list[Granule]:
        """One bounded range query; None is for time-independent DEM tiles."""
        return await asyncio.to_thread(self._search_day_blocking, short_name, version, bbox, period)

    def _search_day_blocking(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date | Period | None,
    ) -> list[Granule]:
        return self.run_authenticated(lambda: self._download(short_name, version, bbox, day))

    def run_authenticated[T](self, operation: Callable[[], T]) -> T:
        # earthaccess stores auth/session state globally. Keep configured .env
        # credentials scoped to the serialized search/download operation.
        with _AUTH_LOCK:
            previous = {key: os.environ.get(key) for key in self._credentials}
            os.environ.update(self._credentials)
            try:
                return operation()
            except Exception as exc:
                raise GranuleAccessError("Earthdata source access failed") from exc
            finally:
                for key, value in previous.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value

    def _download(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date | Period | None,
    ) -> list[Granule]:
        import earthaccess  # noqa: PLC0415 -- optional until authenticated data is requested

        auth = earthaccess.login(strategy="environment", persist=False)
        if not auth.authenticated:
            raise GranuleAccessError("Earthdata authentication failed")
        limit = 512 if isinstance(day, Period) else 16 if day is None else _MAX_GRANULES_PER_DAY
        query: dict[str, Any] = {
            "short_name": short_name,
            "version": version,
            "bounding_box": bbox,
            "count": limit + 1,
        }
        period = day if isinstance(day, Period) else Period(day, day) if day is not None else None
        if period is not None:
            query["temporal"] = (period.start.isoformat(), period.end.isoformat())
        results = earthaccess.search_data(**query)
        if len(results) > limit:
            raise GranuleAccessError("Earthdata granule limit exceeded")
        granules = []
        for result in results:
            extent = result["umm"]["TemporalExtent"]["RangeDateTime"]
            observed = date.fromisoformat(str(extent["BeginningDateTime"])[:10])
            if period is not None and not period.start <= observed <= period.end:
                continue
            links = result.data_links(access="external")
            suffixes = (
                (".ndvi.tif", ".fmask.tif")
                if short_name.endswith("_VI")
                else (".zip", ".hgt")
                if short_name in {"NASADEM_HGT", "SRTMGL1"}
                else (".nc4", ".nc", ".h5")
            )
            urls = [u for u in links if u.lower().endswith(suffixes)]
            if not urls:
                continue
            self._download_dir.mkdir(parents=True, exist_ok=True)
            paths = [
                Path(p)
                for p in earthaccess.download(
                    urls, str(self._download_dir), threads=1, show_progress=False
                )
            ]
            if len(paths) != len(urls):
                raise GranuleAccessError("Earthdata granule download was incomplete")
            qa = next((p for p in paths if p.name.lower().endswith(".fmask.tif")), None)
            primary = next((p for p in paths if p != qa), None)
            if primary is not None:
                granules.append(Granule(path=primary, data_date=observed, qa_path=qa))
        return granules
