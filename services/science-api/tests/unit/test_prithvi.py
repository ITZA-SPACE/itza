from pathlib import Path

import pytest
from pydantic import ValidationError

from itza_science.api.prithvi import Publication
from tests.prithvi_support import fixture_publication

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("case", ["duplicate", "filename", "legend", "checksum", "source", "extra"])
def test_reject_invalid_publications(tmp_path: Path, case: str) -> None:
    body = fixture_publication(tmp_path).model_dump(mode="json")
    if case == "duplicate":
        body["seasons"].append(body["seasons"][0])
    elif case == "filename":
        body["seasons"][0]["file"] = "prithvi-2023.tif"
    elif case == "legend":
        body["classes"] = {"0": "crop"}
    elif case == "checksum":
        body["seasons"][0]["sha256"] = "no"
    elif case == "source":
        body["seasons"][0]["provenance"] = []
    else:
        body["extra"] = True
    with pytest.raises(ValidationError):
        Publication.model_validate(body)
