import pytest

from itza_science.core.factors import (
    BASELINE_EPSILON,
    RATIO_MAX,
    RATIO_MIN,
    change_factor,
    monthly_factors,
    spread,
)

pytestmark = pytest.mark.unit


def test_additive_factor_is_difference() -> None:
    assert change_factor("additive", 10.0, 12.5) == pytest.approx(2.5)
    assert change_factor("additive", 10.0, 8.0) == pytest.approx(-2.0)


def test_multiplicative_factor_is_ratio() -> None:
    assert change_factor("multiplicative", 2.0, 1.5) == pytest.approx(0.75)


def test_multiplicative_factor_is_capped_both_ways() -> None:
    assert change_factor("multiplicative", 0.05, 5.0) == RATIO_MAX
    assert change_factor("multiplicative", 5.0, 0.1) == RATIO_MIN


def test_multiplicative_factor_neutral_when_baseline_near_zero() -> None:
    assert change_factor("multiplicative", BASELINE_EPSILON / 2, 4.0) == 1.0


def test_monthly_factors_rejects_length_mismatch() -> None:
    with pytest.raises(ValueError, match="zip"):
        monthly_factors("additive", [1.0, 2.0], [1.0])


def test_spread_reports_median_min_max_per_month() -> None:
    result = spread([[1.0, 10.0], [2.0, 20.0], [9.0, 30.0]])
    assert result.median == [2.0, 20.0]
    assert result.low == [1.0, 10.0]
    assert result.high == [9.0, 30.0]
