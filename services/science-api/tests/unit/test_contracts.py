import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, TypeAdapter, ValidationError

from itza_science.contracts.assistant_tools_schema import AssistantToolCall, DefineTermOutput
from itza_science.contracts.canonical_series_schema import CanonicalSeries
from itza_science.contracts.engine_input_schema import EngineInput
from itza_science.contracts.engine_output_schema import EngineOutput
from itza_science.contracts.evidence_card_schema import EvidenceCard
from itza_science.contracts.field_bundle_schema import FieldBundle
from itza_science.contracts.provenance_schema import Provenance

pytestmark = pytest.mark.unit

REPO = Path(__file__).resolve().parents[4]
FIXTURES = sorted((REPO / "fixtures" / "synthetic").glob("*.json"))
MODELS: dict[str, Any] = {
    "provenance": Provenance,
    "canonical-series": CanonicalSeries,
    "field-bundle": FieldBundle,
    "engine-input": EngineInput,
    "engine-output": EngineOutput,
    "evidence-card": EvidenceCard,
    "assistant-tools": AssistantToolCall,
}


def read(path: Path) -> Any:
    return json.loads(path.read_text())


def schema_examples(name: str) -> list[Any]:
    examples: list[Any] = read(REPO / "schemas" / f"{name}.schema.json")["examples"]
    return examples


def card() -> dict[str, Any]:
    example: dict[str, Any] = schema_examples("evidence-card")[0]
    return example


def bundle() -> dict[str, Any]:
    data: dict[str, Any] = read(FIXTURES[0])
    return data


@pytest.mark.parametrize("name", sorted(MODELS))
def test_schema_examples_validate(name: str) -> None:
    examples = schema_examples(name)
    assert examples
    for example in examples:
        TypeAdapter(MODELS[name]).validate_python(example)


def test_two_synthetic_fixtures_exist() -> None:
    assert len(FIXTURES) == 2


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.name)
def test_synthetic_fixtures_validate(path: Path) -> None:
    model = FieldBundle.model_validate(read(path))
    assert model.synthetic is True
    assert all(series.provenance.source for series in model.series)


def test_bundle_series_without_provenance_is_rejected() -> None:
    data = bundle()
    del data["series"][0]["provenance"]
    with pytest.raises(ValidationError, match="provenance"):
        FieldBundle.model_validate(data)


def test_bundle_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        FieldBundle.model_validate({**bundle(), "extra": 1})


@pytest.mark.parametrize(
    "field",
    [
        "why",
        "evidence",
        "benefits",
        "gaps",
        "risks",
        "score",
        "resilience_headline",
        "confidence",
        "contributions",
    ],
)
def test_card_missing_mandatory_field_is_rejected(field: str) -> None:
    data = card()
    del data[field]
    with pytest.raises(ValidationError, match=field):
        EvidenceCard.model_validate(data)


def test_card_evidence_item_without_source_is_rejected() -> None:
    data = card()
    del data["evidence"][0]["source"]
    with pytest.raises(ValidationError, match="source"):
        EvidenceCard.model_validate(data)


def test_unknown_tool_call_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(AssistantToolCall).validate_python({"tool": "delete_field", "input": {}})


def test_tool_output_models_are_strict() -> None:
    assert DefineTermOutput(term="ET0", definition="x").term == "ET0"
    with pytest.raises(ValidationError):
        DefineTermOutput.model_validate({"term": "ET0"})


def test_models_are_pydantic_models() -> None:
    assert issubclass(FieldBundle, BaseModel)
