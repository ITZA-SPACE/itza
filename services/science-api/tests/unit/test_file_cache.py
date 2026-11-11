from pathlib import Path

import pytest

from itza_science.cache.files import FileCache

pytestmark = pytest.mark.unit


def test_key_is_stable_and_depends_on_version_and_params() -> None:
    base = FileCache.key("ns", "v1", {"a": 1, "b": 2})
    assert base == FileCache.key("ns", "v1", {"b": 2, "a": 1})
    assert base != FileCache.key("ns", "v2", {"a": 1, "b": 2})
    assert base != FileCache.key("ns", "v1", {"a": 1, "b": 3})
    assert base != FileCache.key("other", "v1", {"a": 1, "b": 2})


def test_miss_then_roundtrip(tmp_path: Path) -> None:
    cache = FileCache(tmp_path)
    assert cache.get("ns", "k") is None
    cache.set("ns", "k", {"x": [1, 2]})
    assert cache.get("ns", "k") == {"x": [1, 2]}


def test_corrupt_entry_is_a_miss(tmp_path: Path) -> None:
    cache = FileCache(tmp_path)
    cache.set("ns", "k", {"x": 1})
    (tmp_path / "cache" / "ns" / "k.json").write_text("{not json")
    assert cache.get("ns", "k") is None
