"""Published hero bundles must hold real data, not only schema-valid gaps.

Schema validation accepts a series with 2 valid values out of 4,232 days. These checks count valid
values instead. Today's shortfalls are listed in KNOWN_GAPS as strict expected failures: a new gap
fails CI, and fixing a listed gap also fails (XPASS) until its entry is removed.
"""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pytest

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[2]
BUNDLES = ROOT / "apps/web/public/bundles"
HEROES = ("setif-story", "akron-proof-1", "akron-proof-2", "akron-proof-3")
HISTORY = (date(2001, 1, 1), date(2025, 12, 31))  # the replay record (TECHNICAL_ARCHITECTURE F-14)
SMAP_START = date(2015, 3, 31)


@dataclass(frozen=True)
class Rule:
    variable: str
    start: date
    minimum: float  # share of calendar days with a value; 16-day NDVI composites use 1/16
    source: str | None = None  # required provenance source, when the chain head must win


RULES = (
    *(Rule(v, HISTORY[0], 0.95) for v in ("tmax", "tmin", "tmean", "rh", "wind2m", "srad")),
    Rule("precip", HISTORY[0], 0.95, source="gpm_imerg_final_daily"),
    Rule("ndvi", HISTORY[0], 0.8 / 16),
    Rule("sm_rootzone", SMAP_START, 0.9),
    Rule("sm_surface", SMAP_START, 0.9),
    Rule("et_actual", HISTORY[0], 0.9),
)

# Shortfalls measured on 2026-11-15; remove an entry when the rebuilt bundles fix it.
KNOWN_GAPS = {
    (hero, variable)
    for hero in HEROES
    for variable in (
        "tmax",
        "tmin",
        "tmean",
        "rh",
        "wind2m",
        "srad",
        "precip",
        "ndvi",
        "sm_rootzone",
        "sm_surface",
        "et_actual",
    )
}


def series(hero: str, variable: str) -> dict[str, Any] | None:
    bundle = json.loads((BUNDLES / hero / "bundle.json").read_text())
    return next((s for s in bundle["series"] if s["var"] == variable), None)


def coverage(found: dict[str, Any], start: date, end: date) -> float:
    """Share of calendar days in [start, end] that carry a non-null daily value."""
    first = date.fromisoformat(found["start"])
    days = (end - start).days + 1
    valid = 0
    for offset, value in enumerate(found["values"]):
        day = date.fromordinal(first.toordinal() + offset)
        if value is not None and start <= day <= end:
            valid += 1
    return valid / days


@pytest.mark.parametrize("hero", HEROES)
@pytest.mark.parametrize("rule", RULES, ids=lambda r: r.variable)
def test_hero_series_hold_real_data(hero: str, rule: Rule, request: pytest.FixtureRequest) -> None:
    if (hero, rule.variable) in KNOWN_GAPS:
        request.applymarker(pytest.mark.xfail(strict=True, reason="known hollow series"))
    found = series(hero, rule.variable)
    assert found is not None, f"{hero} has no {rule.variable} series"
    if rule.source is not None:
        assert found["provenance"]["source"] == rule.source
    share = coverage(found, rule.start, HISTORY[1])
    assert share >= rule.minimum, f"{hero} {rule.variable}: {share:.1%} of days since {rule.start}"


def test_coverage_counts_only_days_inside_the_window() -> None:
    found = {"start": "2000-12-30", "values": [1.0, 1.0, 1.0, None, 1.0]}
    assert coverage(found, date(2001, 1, 1), date(2001, 1, 4)) == pytest.approx(2 / 4)
