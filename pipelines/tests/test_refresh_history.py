from datetime import date, timedelta

import pytest

import refresh_history as rh

pytestmark = pytest.mark.unit


def test_ascii_values_reads_dap2_lines_and_drops_fill() -> None:
    text = (
        "Dataset: x.nc4\n"
        "precipitation.precipitation[precipitation.time=8427][precipitation.lon=-103.15], 2.15\n"
        "/Geophysical_Data/sm_rootzone[0], -9999\n"
        "cell_lat[3], 82.7504\n"
    )
    assert rh.ascii_values(text) == [2.15, None, 82.7504]


def test_imerg_index_hits_the_centre_of_the_pixel() -> None:
    assert rh.imerg_index(40.15, -103.15) == (768, 1301)
    assert rh.imerg_index(-89.95, -179.95) == (0, 0)


def test_mod16_spreads_composites_and_shortens_the_last_one() -> None:
    first, last = date(2001, 12, 19), date(2001, 12, 27)
    composites = {first: (80, 0), last: (50, 0), date(2001, 12, 11): (120, 40)}
    values = rh.mod16_daily(composites, date(2001, 12, 11), date(2001, 12, 31))
    assert values[:8] == [None] * 8  # QC >= 32 is rejected
    assert values[8] == pytest.approx(80 * 0.1 / 8)
    assert values[16] == pytest.approx(50 * 0.1 / 5)  # Dec 27-31
    assert len(values) == 21


def test_splice_prefers_the_head_and_records_switches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rh, "START", date(2001, 1, 1))
    monkeypatch.setattr(rh, "END", date(2001, 1, 4))
    head = [1.0, None, 3.0, None]
    tail = [9.0, 2.0, 9.0, None]
    out = rh.splice(
        "precip",
        "mm/day",
        [
            ("gpm_imerg_final_daily", "IMERG", 11000, head),
            ("nasa_power_daily", "POWER", 55000, tail),
        ],
        "test",
    )
    assert out["values"] == [1.0, 2.0, 3.0, None]
    assert out["provenance"]["source"] == "gpm_imerg_final_daily"
    assert out["provenance"]["resolution_m"] == 55000
    assert [s["source"] for s in out["segments"]] == [
        "gpm_imerg_final_daily",
        "nasa_power_daily",
        "gpm_imerg_final_daily",
    ]
    assert out["start"] == "2001-01-01"
    assert date.fromisoformat(out["start"]) + timedelta(days=3) == date(2001, 1, 4)


def test_splice_from_one_source_has_no_segments(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rh, "START", date(2001, 1, 1))
    monkeypatch.setattr(rh, "END", date(2001, 1, 2))
    out = rh.splice("sm_rootzone", "m3/m3", [("smap_l4", "SPL4SMGP", 9000, [0.2, None])], "t")
    assert "segments" not in out
    assert out["quality"] == [0, 2]
