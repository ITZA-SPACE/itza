from datetime import date

import pytest

import appeears
import build_demo
import refresh_history

pytestmark = pytest.mark.unit

TABLE = (
    "ID,Category,Latitude,Longitude,Date,MOD13Q1_061__250m_16_days_NDVI,"
    "MOD13Q1_061__250m_16_days_pixel_reliability\n"
    "akron-proof-1,proof,40.1,-103.1,2024-06-09,0.6123,0\n"
    "akron-proof-1,proof,40.1,-103.1,2024-06-25,0.4,3\n"
)
ET_TABLE = (
    "ID,Category,Latitude,Longitude,Date,MOD16A2GF_061_ET_500m,MOD16A2GF_061_ET_QC_500m\n"
    "akron-proof-1,proof,40.1,-103.1,2001-12-27,5.0,0\n"
)


def test_parse_tables_merges_products_per_hero() -> None:
    data = appeears.parse_tables([TABLE, ET_TABLE])
    assert data["akron-proof-1"]["ndvi"]["2024-06-09"] == [0.6123, 0.0]
    assert data["akron-proof-1"]["et"] == {"2001-12-27": [5.0, 0.0]}


def test_appeears_ndvi_keeps_only_reliable_composites() -> None:
    hero = appeears.parse_tables([TABLE])["akron-proof-1"]
    series = build_demo.appeears_ndvi(hero["ndvi"], date(2024, 6, 9), date(2024, 6, 25))
    assert series["values"][0] == pytest.approx(0.6123)
    assert series["values"][16] is None  # reliability 3 is rejected
    assert "AppEEARS" in series["provenance"]["method"]


def test_appeears_mod16_converts_back_to_raw_scale(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(refresh_history, "START", date(2001, 12, 27))
    monkeypatch.setattr(refresh_history, "END", date(2001, 12, 31))
    values = refresh_history.appeears_mod16({"2001-12-27": [5.0, 0.0]})
    assert values == pytest.approx([1.0] * 5)  # 5 kg/m2 over the short 5-day composite


def test_load_returns_none_without_a_path() -> None:
    assert appeears.load(None) is None
