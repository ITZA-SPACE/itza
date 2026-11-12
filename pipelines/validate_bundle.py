"""Validates a built bundle document against `schemas/field-bundle.schema.json` (#17).

Same approach as `services/science-api/tests/integration/test_bundles.py`'s
`_validate_bundle_schema`: every schema in `schemas/` is registered so `$ref`s between them
resolve, then the document is checked against `field-bundle.schema.json` itself.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _validator() -> Draft202012Validator:
    registry: Registry = Registry()
    for path in SCHEMAS_DIR.glob("*.schema.json"):
        schema = json.loads(path.read_text())
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    schema = json.loads((SCHEMAS_DIR / "field-bundle.schema.json").read_text())
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


def validate_bundle_document(document: dict[str, Any]) -> None:
    """Raises `jsonschema.ValidationError` (with a readable path) if the document is invalid."""
    _validator().validate(document)
