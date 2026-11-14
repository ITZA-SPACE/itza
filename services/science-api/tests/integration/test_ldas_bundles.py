import json
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from shapely.geometry import box, mapping

from itza_science.adapters.base import Period
from itza_science.adapters.gldas import GLDAS, NLDAS, GldasAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from tests.integration.test_bundles import _wait_for_done
from tests.ldas_support import LDAS_FIXTURES, RecordedLdasReader

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("source", [GLDAS, NLDAS])
def test_real_pre_smap_season_bundle(client: TestClient, source: str) -> None:
    manifest = json.loads((LDAS_FIXTURES / source / "manifest.json").read_text())
    app = client.app
    assert isinstance(app, FastAPI)
    reader = RecordedLdasReader()
    app.state.bundle_adapters = [SmapL4Adapter(reader), GldasAdapter(reader)]
    app.state.spatial = None
    # A full pre-2015 season, with one real recorded day. Unrecorded days stay missing.
    period = Period(date(2014, 5, 1), date(2014, 7, 31))
    response = client.post(
        "/v1/bundles",
        json={
            "geometry": mapping(box(*manifest["bbox"])),
            "period": {"start": str(period.start), "end": str(period.end)},
            "variables": ["sm_rootzone", "et_actual"],
        },
    )
    assert response.status_code == 200
    bundle_id = response.json()["id"]
    assert _wait_for_done(client, bundle_id)["status"] == "done"
    for variable, expected in manifest["daily_values"].items():
        series = client.get(f"/v1/bundles/{bundle_id}/series/{variable}").json()
        assert len(series["values"]) == 92
        assert series["values"][31] == pytest.approx(expected)
        assert sum(value is not None for value in series["values"]) == 1
        assert series["quality"][31] == 1
        assert series["quality"][0] == 2
        assert series["provenance"]["source"] == source
        assert "modeled" in series["provenance"]["method"]
        assert series["provenance"]["version"] == manifest["version"]
