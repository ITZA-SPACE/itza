"""Pure, offline tests for the hero-field list and the CDL label a bundle stores (#17)."""

from pathlib import Path

import pytest
import yaml
from itza_science.clients.cdl import CdlLabel
from itza_science.core.field import area_ha, field_id, to_shapely

from build_demo import ROOT, Hero, Manifest

HERO_FIELDS_YAML = ROOT / "pipelines/hero_fields.yaml"


def load_hero_fields() -> list[Hero]:
    return Manifest.model_validate(yaml.safe_load(HERO_FIELDS_YAML.read_text())).fields


pytestmark = pytest.mark.unit


def test_loads_a_story_field_and_proof_fields() -> None:
    fields = load_hero_fields()
    by_role = {f.role for f in fields}
    assert by_role == {"story", "proof"}
    assert sum(1 for f in fields if f.role == "story") == 1
    assert sum(1 for f in fields if f.role == "proof") >= 3
    assert len({f.id for f in fields}) == len(fields)


def test_every_field_has_a_small_valid_polygon() -> None:
    for field in load_hero_fields():
        shapely_geometry = to_shapely(field.geometry)
        assert shapely_geometry.is_valid
        area = area_ha(shapely_geometry)
        assert 1 < area < 100, f"{field.id}: {area} ha looks wrong for a single field"


def test_field_ids_are_stable_sha256_of_the_geometry() -> None:
    fields = {f.id: f for f in load_hero_fields()}
    story = next(f for f in fields.values() if f.role == "story")
    restored = Hero.model_validate_json(story.model_dump_json())
    assert field_id(story.geometry) == field_id(restored.geometry)
    assert field_id(story.geometry).startswith("sha256:")


def test_proof_fields_are_in_the_great_plains_region_pack() -> None:
    for field in load_hero_fields():
        if field.role == "proof":
            assert field.region_pack == "us-central-great-plains"


def test_manifest_rejects_duplicate_sampling_areas() -> None:
    document = yaml.safe_load(HERO_FIELDS_YAML.read_text())
    document["fields"].append(document["fields"][0])
    with pytest.raises(ValueError, match="duplicate"):
        Manifest.model_validate(document)


def test_a_crop_label_round_trips_through_json(tmp_path: Path) -> None:
    import json

    label = CdlLabel(year=2020, value=24, category="Winter Wheat", classification="crop")
    path = tmp_path / "cdl.json"
    path.write_text(json.dumps([label.model_dump(mode="json")]))
    restored = json.loads(path.read_text())
    assert restored == [
        {"year": 2020, "value": 24, "category": "Winter Wheat", "classification": "crop"}
    ]


def test_hero_fields_yaml_exists_at_the_expected_path() -> None:
    assert HERO_FIELDS_YAML.is_file()
