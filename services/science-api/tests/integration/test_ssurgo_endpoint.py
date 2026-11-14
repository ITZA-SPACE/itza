import json
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from itza_science.adapters.ssurgo import SDA, SoilAdapter

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[4]


@pytest.mark.anyio
@pytest.mark.parametrize("case", ["proof", "setif", "outage"])
async def test_bundle_soil_and_provenance(client: TestClient, case: str) -> None:
    field = "setif-story" if case == "setif" else "akron-proof-1"
    geometry = json.loads((ROOT / f"apps/web/public/bundles/{field}/field.json").read_text())[
        "geometry"
    ]
    raw = json.loads((ROOT / "fixtures/ssurgo/akron-proof-1.json").read_text())
    grids = json.loads((ROOT / "fixtures/adapters/soilgrids_setif_field.json").read_text())

    def handle(request: httpx.Request) -> httpx.Response:
        if str(request.url) == SDA:
            assert case != "setif"
            return httpx.Response(503 if case == "outage" else 200, json=raw)
        return httpx.Response(200, json=grids)

    assert isinstance(client.app, FastAPI)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as upstream:
        client.app.state.soil = SoilAdapter(upstream)
        client.app.state.spatial = None
        client.app.state.bundle_adapters = []
        response = client.post(
            "/v1/bundles",
            json={"geometry": geometry, "period": {"start": "2025-01-01", "end": "2025-01-02"}},
        )
        identifier = response.json()["id"]
        status = client.get(f"/v1/bundles/{identifier}").json()
        assert status["status"] == "done"
        assert status["soil"]["clay_pct"]["source"] == (
            "ssurgo" if case == "proof" else "soilgrids"
        )
        metadata = client.get(f"/v1/bundles/{identifier}/soil")
        assert metadata.status_code == 200
        assert metadata.json()["provenance"]
        if case == "outage":
            assert any("SSURGO" in gap["reason"] for gap in status["gaps"])


def test_missing_soil_metadata(client: TestClient) -> None:
    assert client.get(f"/v1/bundles/{'0' * 64}/soil").status_code == 404


def test_soil_rejects_malformed_bundle_id(client: TestClient) -> None:
    assert client.get("/v1/bundles/not-a-bundle/soil").status_code == 422
