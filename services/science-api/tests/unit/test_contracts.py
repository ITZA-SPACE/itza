import copy
from typing import Any

import pytest
from pydantic import ValidationError

from itza_science.contracts.assistant_tools_schema import AssistantToolMessage
from itza_science.contracts.engine_input_schema import EngineInput
from itza_science.contracts.engine_output_schema import EngineOutput
from itza_science.contracts.evidence_card_schema import EvidenceCard
from itza_science.contracts.field_bundle_schema import FieldBundle
from tests.support import load_synthetic

pytestmark = pytest.mark.unit

BUNDLES = ["semi-arid-winter-cereal.bundle.json", "fallow-heavy.bundle.json"]


@pytest.mark.parametrize("name", BUNDLES)
def test_synthetic_bundles_validate(name: str) -> None:
    bundle = FieldBundle.model_validate(load_synthetic(name))
    assert bundle.series
    assert all(series.provenance.source == "synthetic" for series in bundle.series)


def test_examples_validate() -> None:
    EngineInput.model_validate(load_synthetic("engine-input.example.json"))
    EngineOutput.model_validate(load_synthetic("engine-output.example.json"))
    EvidenceCard.model_validate(load_synthetic("evidence-card.example.json"))
    for message in load_synthetic("assistant-tools.example.json"):
        AssistantToolMessage.model_validate(message)


def test_series_without_provenance_is_rejected() -> None:
    bundle = load_synthetic(BUNDLES[0])
    del bundle["series"][0]["provenance"]
    with pytest.raises(ValidationError, match="provenance"):
        FieldBundle.model_validate(bundle)


def test_unknown_variable_is_rejected() -> None:
    bundle = load_synthetic(BUNDLES[0])
    bundle["series"][0]["var"] = "rainfall"
    with pytest.raises(ValidationError):
        FieldBundle.model_validate(bundle)


@pytest.mark.parametrize("field", ["why", "evidence", "benefits", "gaps", "risks", "confidence"])
def test_evidence_card_missing_mandatory_field_is_rejected(field: str) -> None:
    card = load_synthetic("evidence-card.example.json")
    del card[field]
    with pytest.raises(ValidationError, match=field):
        EvidenceCard.model_validate(card)


def test_evidence_item_without_source_is_rejected() -> None:
    card = load_synthetic("evidence-card.example.json")
    del card["evidence"][0]["source"]
    with pytest.raises(ValidationError, match="source"):
        EvidenceCard.model_validate(card)


def test_out_of_range_priority_is_rejected() -> None:
    engine_input = load_synthetic("engine-input.example.json")
    engine_input["priorities"]["save_water"] = 9
    with pytest.raises(ValidationError):
        EngineInput.model_validate(engine_input)


def test_unknown_tool_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AssistantToolMessage.model_validate({"tool": "drop_tables", "input": {}})


def test_extra_fields_are_rejected() -> None:
    card: dict[str, Any] = copy.deepcopy(load_synthetic("evidence-card.example.json"))
    card["surprise"] = 1
    with pytest.raises(ValidationError):
        EvidenceCard.model_validate(card)
