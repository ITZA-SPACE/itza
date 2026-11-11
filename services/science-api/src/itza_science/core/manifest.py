"""Loads data-sources.yaml: source metadata, variable mapping and priority chains.

Shared with the browser adapters (TECHNICAL_ARCHITECTURE.md §5.2); this is the
server-side reader.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PACKAGED_MANIFEST_PATH = Path(__file__).with_name("data-sources.yaml")
_REPO_MANIFEST_PATH = Path(__file__).resolve().parents[5] / "data-sources.yaml"
MANIFEST_PATH = _REPO_MANIFEST_PATH if _REPO_MANIFEST_PATH.is_file() else PACKAGED_MANIFEST_PATH


@dataclass(frozen=True)
class SourceVariable:
    source_var: str
    unit: str


@dataclass(frozen=True)
class SourceEntry:
    id: str
    product: str
    version: str
    runtime: str
    auth: str
    resolution_m: float
    variables: dict[str, SourceVariable]


@dataclass(frozen=True)
class Manifest:
    sources: dict[str, SourceEntry]
    priority: dict[str, list[str]]

    def chain(self, var: str) -> list[str]:
        """Ordered source ids for a canonical variable, highest priority first."""
        return self.priority.get(var, [])


def _parse_source(item: dict[str, Any]) -> SourceEntry:
    variables = {
        name: SourceVariable(source_var=spec["source_var"], unit=spec["unit"])
        for name, spec in item["variables"].items()
    }
    return SourceEntry(
        id=item["id"],
        product=item["product"],
        version=str(item["version"]),
        runtime=item["runtime"],
        auth=item["auth"],
        resolution_m=float(item["resolution_m"]),
        variables=variables,
    )


@lru_cache
def load_manifest(path: Path = MANIFEST_PATH) -> Manifest:
    raw = yaml.safe_load(path.read_text())
    sources = {item["id"]: _parse_source(item) for item in raw["sources"]}
    return Manifest(sources=sources, priority=raw.get("priority", {}))
