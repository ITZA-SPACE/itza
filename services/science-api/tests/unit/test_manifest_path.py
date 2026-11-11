"""The manifest path is overridable so the container image can relocate data-sources.yaml."""

import importlib
from pathlib import Path

import pytest

from itza_science.core import manifest

pytestmark = pytest.mark.unit


def test_manifest_path_uses_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ITZA_DATA_SOURCES_PATH", "/app/data-sources.yaml")
    try:
        assert Path("/app/data-sources.yaml") == importlib.reload(manifest).MANIFEST_PATH
    finally:
        monkeypatch.delenv("ITZA_DATA_SOURCES_PATH")
        importlib.reload(manifest)


def test_manifest_path_defaults_to_repository_root() -> None:
    assert manifest.MANIFEST_PATH.name == "data-sources.yaml"
    assert manifest.MANIFEST_PATH.exists()
