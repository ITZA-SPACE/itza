import copy
import json
from pathlib import Path

import httpx
import pytest
from shapely.geometry import box, shape

from itza_science.adapters.ssurgo import (
    SDA,
    SOILGRIDS,
    SoilAdapter,
    aggregate,
    parse_soilgrids,
    query,
)

pytestmark = pytest.mark.unit
ROOT = Path(__file__).resolve().parents[4]
RAW = json.loads((ROOT / "fixtures/ssurgo/akron-proof-1.json").read_text())
FIELD = shape(
    json.loads((ROOT / "apps/web/public/bundles/akron-proof-1/field.json").read_text())["geometry"]
)
SETIF = shape(
    json.loads((ROOT / "apps/web/public/bundles/setif-story/field.json").read_text())["geometry"]
)
GRIDS = json.loads((ROOT / "fixtures/adapters/soilgrids_setif_field.json").read_text())


def test_real_polygon_weighted_profile() -> None:
    result = aggregate(RAW, FIELD)
    assert result.soil["awc_mm_per_m"].value == pytest.approx(184.4976070)
    assert result.soil["clay_pct"].value == pytest.approx(26.3145107)
    assert result.soil["soc_pct"].value == pytest.approx(result.soil["om_pct"].value / 1.724)
    assert sum(result.hydrologic_groups.values()) == pytest.approx(1)
    assert result.provenance[0]["survey_versions"][0][0] == "CO121"
    assert "STIntersection" in query(FIELD)


def test_order_invariant() -> None:
    permuted = {"Table": [RAW["Table"][0], *reversed(RAW["Table"][1:])]}
    a, b = aggregate(RAW, FIELD), aggregate(permuted, FIELD)
    for key in a.soil:
        assert a.soil[key].value == pytest.approx(b.soil[key].value)


@pytest.mark.parametrize("case", ["empty", "columns", "negative", "overlap", "nan"])
def test_invalid_table(case: str) -> None:
    data = copy.deepcopy(RAW)
    columns = data["Table"][0]
    if case == "empty":
        data = {}
    elif case == "columns":
        columns[0] = "bad"
    elif case == "overlap":
        data["Table"].append(data["Table"][1])
    else:
        data["Table"][1][columns.index("claytotal_r")] = -1 if case == "negative" else "NaN"
    with pytest.raises(ValueError, match=r".+"):
        aggregate(data, FIELD)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "case", ["success", "outside", "outage", "partial", "both_down", "invalid"]
)
async def test_source_priority_and_fallback(case: str) -> None:
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if str(request.url).startswith(SOILGRIDS):
            return httpx.Response(503 if case == "both_down" else 200, json=GRIDS)
        if case in ("outage", "both_down"):
            return httpx.Response(503)
        data = copy.deepcopy(RAW)
        if case == "partial":
            for row in data["Table"][1:]:
                row[data["Table"][0].index("awc_r")] = None
        return httpx.Response(200, json={} if case == "invalid" else data)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        result = await SoilAdapter(client).fetch(SETIF if case == "outside" else FIELD)
    if case == "both_down":
        assert not result.soil
    elif case == "success":
        assert result.soil["clay_pct"].source == "ssurgo"
        assert calls == [SDA]
    else:
        assert result.soil["awc_mm_per_m"].source == "soilgrids"
        if case == "partial":
            assert result.soil["clay_pct"].source == "ssurgo"
        if case == "outside":
            assert result.gaps[0].severity == "info"
            assert not any(url == SDA for url in calls)
        else:
            assert result.gaps


def test_impossible_soilgrids_ph_is_not_published() -> None:
    data = copy.deepcopy(GRIDS)
    for layer in data["properties"]["layers"]:
        if layer["name"] == "phh2o":
            for depth in layer["depths"]:
                depth["values"]["mean"] = 10000
    result = parse_soilgrids(data)
    assert "ph" not in result
    assert "clay_pct" in result


@pytest.mark.anyio
async def test_unexpected_ssurgo_payload_falls_back_to_soilgrids() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url).startswith(SDA):
            # Valid JSON with an unexpected shape must not escape as an exception.
            return httpx.Response(200, json=["not", "a", "table"])
        return httpx.Response(200, json=GRIDS)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await SoilAdapter(client).fetch(FIELD)
    assert result.soil["clay_pct"].source == "soilgrids"
    assert any("SSURGO unavailable" in g.reason for g in result.gaps)


@pytest.mark.anyio
@pytest.mark.parametrize("latitude", [49.5, 25.0, 40.1])
async def test_empty_survey_is_info_not_an_outage(latitude: float) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={} if str(request.url) == SDA else GRIDS)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        result = await SoilAdapter(client).fetch(box(-103.1, latitude, -103.09, latitude + 0.01))
    assert result.soil["clay_pct"].source == "soilgrids"
    assert result.gaps[0].severity == "info"
    assert "No SSURGO survey" in result.gaps[0].reason
