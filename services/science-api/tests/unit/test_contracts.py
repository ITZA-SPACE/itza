"""Pydantic contract models generated from schemas/ accept the fixtures and reject bad documents."""

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, TypeAdapter, ValidationError

from itza_science.contracts import (
    canonical_series_schema,
    engine_input_schema,
    engine_output_schema,
    evidence_card_schema,
    field_bundle_schema,
    provenance_schema,
)
from itza_science.contracts.assistant_tools_schema import AssistantToolIo

pytestmark = pytest.mark.unit

SYNTHETIC = Path(__file__).resolve().parents[4] / "fixtures" / "synthetic"
BUNDLES = ["semi-arid-winter-cereal.bundle.json", "fallow-heavy.bundle.json"]
EXAMPLES: dict[str, type[BaseModel]] = {
    "provenance": provenance_schema.Provenance,
    "canonical-series": canonical_series_schema.CanonicalSeries,
    "engine-input": engine_input_schema.EngineInput,
    "engine-output": engine_output_schema.EngineOutput,
    "evidence-card": evidence_card_schema.EvidenceCard,
}


def load(name: str) -> Any:
    return json.loads((SYNTHETIC / name).read_text())


def check_card(card: dict[str, Any]) -> None:
    evidence_card_schema.EvidenceCard.model_validate(card)


@pytest.mark.parametrize("name", BUNDLES)
def test_synthetic_bundle_is_valid(name: str) -> None:
    bundle = field_bundle_schema.FieldBundle.model_validate(load(name))
    assert bundle.field.area_ha == pytest.approx(12.4)
    assert {s.var.value for s in bundle.series} >= {"tmax", "tmin", "precip", "ndvi"}
    assert all(len(s.values) == len(s.quality) for s in bundle.series)


@pytest.mark.parametrize("name", EXAMPLES)
def test_example_validates(name: str) -> None:
    EXAMPLES[name].model_validate(load(f"examples/{name}.json"))


def test_every_assistant_tool_example_validates() -> None:
    adapter = TypeAdapter(AssistantToolIo)
    calls = load("examples/assistant-tools.json")
    assert len(calls) == 10
    for call in calls:
        adapter.validate_python(call)


def test_bundle_without_series_provenance_is_rejected() -> None:
    bundle = load(BUNDLES[0])
    del bundle["series"][3]["provenance"]
    with pytest.raises(ValidationError, match="provenance"):
        field_bundle_schema.FieldBundle.model_validate(bundle)


def test_bundle_with_unknown_variable_is_rejected() -> None:
    bundle = load(BUNDLES[0])
    bundle["series"][0]["var"] = "rainfall"
    with pytest.raises(ValidationError):
        field_bundle_schema.FieldBundle.model_validate(bundle)


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
    card = load("examples/evidence-card.json")
    del card[field]
    with pytest.raises(ValidationError, match=field):
        check_card(card)


@pytest.mark.parametrize(
    "field", ["indicator", "value", "comparison", "source", "resolution", "period"]
)
def test_evidence_item_missing_field_is_rejected(field: str) -> None:
    card = load("examples/evidence-card.json")
    del card["evidence"][0][field]
    with pytest.raises(ValidationError, match=field):
        check_card(card)


def test_card_with_empty_evidence_or_blank_source_is_rejected() -> None:
    card = load("examples/evidence-card.json")
    blank = copy.deepcopy(card)
    blank["evidence"][0]["source"] = ""
    card["evidence"] = []
    for bad in (card, blank):
        with pytest.raises(ValidationError):
            check_card(bad)


def test_engine_input_priorities_must_be_complete_and_in_range() -> None:
    missing = load("examples/engine-input.json")
    del missing["priorities"]["water"]
    high = load("examples/engine-input.json")
    high["priorities"]["water"] = 9
    for bad in (missing, high):
        with pytest.raises(ValidationError):
            engine_input_schema.EngineInput.model_validate(bad)


def test_engine_output_score_must_be_between_zero_and_one() -> None:
    output = load("examples/engine-output.json")
    output["results"][0]["seasons"][0]["composite"] = 1.4
    with pytest.raises(ValidationError):
        engine_output_schema.EngineOutput.model_validate(output)


def test_tool_call_with_wrong_input_is_rejected() -> None:
    adapter = TypeAdapter(AssistantToolIo)
    season = load("examples/assistant-tools.json")[3]
    season["input"] = {"year": 1900}
    with pytest.raises(ValidationError):
        adapter.validate_python(season)
    with pytest.raises(ValidationError):
        adapter.validate_python({"tool": "delete_field", "input": {}, "output": {}})


def test_bundle_can_report_unavailable_terrain_without_invented_values() -> None:
    raw = load(BUNDLES[0])
    raw["field"]["elevation_m"] = None
    raw["field"]["slope_mean_deg"] = None
    bundle = field_bundle_schema.FieldBundle.model_validate(raw)
    assert bundle.field.elevation_m is None
    assert bundle.field.slope_mean_deg is None
