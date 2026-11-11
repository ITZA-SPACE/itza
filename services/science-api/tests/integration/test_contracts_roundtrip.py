import json
from typing import Any

import pytest

from itza_science.contracts.engine_output_schema import EngineOutput
from itza_science.contracts.evidence_card_schema import EvidenceCard
from itza_science.contracts.field_bundle_schema import FieldBundle
from tests.support import load_synthetic

pytestmark = pytest.mark.integration


def roundtrip(model_type: Any, data: Any) -> Any:
    model = model_type.model_validate(data)
    return json.loads(model.model_dump_json(exclude_none=True, by_alias=True))


@pytest.mark.parametrize(
    "name", ["semi-arid-winter-cereal.bundle.json", "fallow-heavy.bundle.json"]
)
def test_bundle_survives_json_roundtrip(name: str) -> None:
    data = load_synthetic(name)
    assert roundtrip(FieldBundle, data) == data


def test_engine_output_and_card_survive_json_roundtrip() -> None:
    output = load_synthetic("engine-output.example.json")
    card = load_synthetic("evidence-card.example.json")
    assert roundtrip(EngineOutput, output) == output
    assert roundtrip(EvidenceCard, card) == card
