"""Shared server adapter contract (TECHNICAL_ARCHITECTURE.md §5.1)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from shapely.geometry.base import BaseGeometry

from itza_science.contracts.canonical_series_schema import CanonicalSeries, Var
from itza_science.core.errors import Gap


@dataclass(frozen=True)
class Period:
    start: date
    end: date

    def days(self) -> list[date]:
        n = (self.end - self.start).days + 1
        return [date.fromordinal(self.start.toordinal() + i) for i in range(n)]


@dataclass(frozen=True)
class Capabilities:
    id: str
    variables: tuple[Var, ...]
    resolution_m: float
    auth: str
    """``"none"`` or ``"earthdata"``."""


@dataclass
class FetchResult:
    series: list[CanonicalSeries]
    gaps: list[Gap]


class DataAdapter(Protocol):
    """One NASA data source, fetched server-side with Earthdata credentials."""

    id: str

    def capabilities(self) -> Capabilities: ...

    async def fetch(
        self, geometry: BaseGeometry, period: Period, variables: tuple[Var, ...]
    ) -> FetchResult:
        """Never raises on missing or partial data; returns ``Gap`` records instead."""
        ...
