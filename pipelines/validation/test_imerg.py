"""Offline IMERG monthly conversion, grid sampling and missingness checks."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from build import HERE, Capture
from capture_imerg import cell, monthly_depth, parse_subset


@pytest.mark.unit
@pytest.mark.parametrize("period,hours", [("2020-02", 696), ("2019-02", 672), ("2020-01", 744)])
def test_rate_to_depth_respects_calendar(period: str, hours: int) -> None:
    assert monthly_depth(1, period) == hours
    assert monthly_depth(0, period) == 0
    assert monthly_depth(-9999.9, period) is None
    assert monthly_depth(float("nan"), period) is None
    with pytest.raises(ValueError, match="mm/hr"):
        monthly_depth(1, period, "mm/day")


@pytest.mark.unit
def test_point_subset_rejects_wrong_files_coordinates_and_grids() -> None:
    filename = "sample.HDF5"
    payload = "Dataset: sample.HDF5\nprecipitation[0][0], 0.25\nlat, 40.15\nlon, -103.15\n"
    assert cell(-103.1695, 40.1679) == (768, 1301)
    assert parse_subset(payload, filename, 768, 1301) == (0.25, [-103.15, 40.15])
    assert parse_subset(payload.replace("0.25", "-9999.9"), filename, 768, 1301)[0] is None
    assert parse_subset(payload.replace("0.25", "nan"), filename, 768, 1301)[0] is None
    for wrong in [
        payload.replace("sample.HDF5", "other.HDF5"),
        payload.replace("40.15", "40.25"),
        payload + "lon, -103.15\n",
        payload.replace("0.25", "0.25, 9"),
        payload.replace("lat, 40.15\n", ""),
    ]:
        with pytest.raises(ValueError):
            parse_subset(wrong, filename, 768, 1301)
    with pytest.raises(ValueError, match="centroid"):
        cell(float("nan"), 40)


@pytest.mark.integration
def test_raw_imerg_extracts_match_normalized_captures() -> None:
    raw = json.loads((HERE / "data/raw/imerg-monthly.json").read_text())
    assert len(raw["granules"]) == 213
    assert len({g["period"] for g in raw["granules"]}) == 213
    assert raw["missing_provider_months"] == ["2025-10", "2025-11", "2025-12"]
    for n in (1, 2, 3):
        field_id = f"akron-proof-{n}"
        capture = Capture.model_validate_json(
            (HERE / f"data/{field_id}-imerg_monthly.json").read_text()
        )
        assert capture.source == "imerg_monthly"
        assert len(capture.observations) == 216
        extracted = {
            g["period"]: next(s for s in g["samples"] if s["field"] == field_id)
            for g in raw["granules"]
        }
        for observation in capture.observations:
            if observation.period in raw["missing_provider_months"]:
                assert observation.value is None
                continue
            sample = extracted[observation.period]
            assert sample["rate_mm_per_hour"] is not None
            assert observation.value == pytest.approx(
                monthly_depth(sample["rate_mm_per_hour"], observation.period)
            )
            assert observation.value == sample["depth_mm"]


@pytest.mark.unit
def test_fetch_month_retains_the_raw_subset(monkeypatch: pytest.MonkeyPatch) -> None:
    import hashlib

    import capture_imerg as module

    filename = "3B-MO.MS.MRG.3IMERG.20200101-S000000-E235959.01.V07B.HDF5"
    response = f"Dataset: {filename}\nprecipitation[0][0], 0.014\nlat, 40.15\nlon, -103.15\n"
    monkeypatch.setattr(module, "get_text", lambda url: response)
    fields = [{"id": "a", "centroid": [-103.17, 40.17]}, {"id": "b", "centroid": [-103.14, 40.13]}]
    raw = module.fetch_month(
        ("2020-01", "https://data.gesdisc.earthdata.nasa.gov/" + filename), fields
    )
    assert len(raw["samples"]) == 2
    assert len(raw["subsets"]) == 1
    assert raw["subsets"][0]["response"] == response
    assert raw["subsets"][0]["sha256"] == hashlib.sha256(response.encode()).hexdigest()
    assert raw["samples"][0]["depth_mm"] == pytest.approx(10.416)
    with pytest.raises(ValueError, match="filename"):
        module.fetch_month(("2020-01", "https://evil.invalid/not-imerg.HDF5"), fields)


@pytest.mark.unit
@pytest.mark.parametrize("size", [100, 65537])
def test_subset_response_size_limit(monkeypatch: pytest.MonkeyPatch, size: int) -> None:
    from unittest.mock import MagicMock

    import capture_imerg as module
    import earthaccess

    session, response = MagicMock(), MagicMock()
    response.__enter__.return_value = response
    response.iter_content.return_value = [b"a" * size]
    session.get.return_value = response
    monkeypatch.setattr(earthaccess, "get_requests_https_session", lambda: session)
    if size <= 65536:
        assert module.get_text("https://example.invalid") == "a" * size
    else:
        with pytest.raises(ValueError, match="64 KiB"):
            module.get_text("https://example.invalid")
    response.raise_for_status.assert_called_once()
