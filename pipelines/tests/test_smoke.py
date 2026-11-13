"""Offline valid-input publication, schema, integrity, resume and failure-atomicity smoke test.

Replaces the former no-credentials smoke that accepted an empty, un-replayable bundle.
Raw observations and spatial inputs are explicit fixtures; no test calls the network.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from itza_science.api.ml import StressModel
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from test_demo import ROOT
from test_demo import hero as hero
from test_demo import source as source

import build_demo as demo
from build_demo import Hero, LiveSource
from capture_fixtures import digest


@pytest.mark.integration
def test_fixture_end_to_end_resume_and_budgets(
    source: LiveSource, hero: Hero, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model = StressModel(ROOT / "services/science-api/models/stress-v1")

    async def exercise() -> None:
        args = (
            hero,
            date(2008, 1, 1),
            date(2023, 12, 31),
            source,
            model,
            tmp_path / "work",
            tmp_path / "published",
        )
        first = await demo.build_field(*args)
        directory = tmp_path / "published" / hero.id
        bundle = json.loads((directory / "bundle.json").read_text())
        registry: Registry[Any] = Registry()
        for schema_file in (ROOT / "schemas").glob("*.schema.json"):
            schema = json.loads(schema_file.read_text())
            registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
        schema = json.loads((ROOT / "schemas/field-bundle.schema.json").read_text())
        Draft202012Validator(schema, registry=registry).validate(bundle)
        assert len(json.loads((directory / "cdl.json").read_text())["labels"]) == 16
        for name, hash_ in first["files"].items():
            assert digest((directory / name).read_bytes()) == hash_
        old = source.part

        async def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
            raise AssertionError("resume must not fetch completed stages")

        monkeypatch.setattr(source, "part", fail)
        assert first == await demo.build_field(*args)
        monkeypatch.setattr(source, "part", old)
        # Size failures preserve the already published bundle.
        monkeypatch.setattr(demo, "MAX_FIELD_BYTES", 1)
        with pytest.raises(ValueError, match="5 MB"):
            await demo.build_field(*args)
        assert json.loads((directory / "bundle.json").read_text()) == bundle

    asyncio.run(exercise())
