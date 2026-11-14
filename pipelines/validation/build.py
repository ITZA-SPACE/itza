"""Rebuild the offline comparisons without network access; see README.md."""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path
from statistics import mean
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    period: str
    value: float | None

    @field_validator("period")
    @classmethod
    def valid_period(cls, value: str) -> str:
        if len(value) == 4:
            date(int(value), 1, 1)
        elif len(value) == 7:
            date.fromisoformat(value + "-01")
        else:
            raise ValueError("period must be YYYY or YYYY-MM")
        return value


class Capture(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    source: Literal["prism", "openet", "quickstats"]
    field: str
    retrieved: date
    url: str
    resolution: str
    unit: str
    status: Literal["ready", "unavailable"]
    reason: str | None = None
    observations: list[Observation]

    @model_validator(mode="after")
    def valid_capture(self) -> Capture:
        periods = [r.period for r in self.observations]
        if len(periods) != len(set(periods)):
            raise ValueError("duplicate observation period")
        if self.status == "unavailable" and (not self.reason or self.observations):
            raise ValueError("unavailable sources need a reason and no observations")
        if self.status == "ready" and not self.observations:
            raise ValueError("ready sources need observations")
        monthly = self.source != "quickstats"
        if any(len(p) != (7 if monthly else 4) for p in periods):
            raise ValueError("incorrect observation cadence")
        expected_unit = {"prism": "mm/month", "openet": "mm/month", "quickstats": "bu/acre"}
        if self.unit != expected_unit[self.source]:
            raise ValueError("unexpected source unit")
        if any(r.value is not None and r.value < 0 for r in self.observations):
            raise ValueError("negative measurement")
        return self


def ranks(values: list[float]) -> list[float]:
    """One-based average ranks for ties (Spearman)."""
    order = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and values[order[i]] == values[order[j]]:
            j += 1
        for k in order[i:j]:
            result[k] = (i + 1 + j) / 2
        i = j
    return result


def correlation(x: list[float], y: list[float]) -> float | None:
    if len(x) < 3:
        return None
    a, b = ranks(x), ranks(y)
    ma, mb = mean(a), mean(b)
    den = math.sqrt(sum((v - ma) ** 2 for v in a) * sum((v - mb) ** 2 for v in b))
    return None if den == 0 else sum((u - ma) * (v - mb) for u, v in zip(a, b, strict=True)) / den


def statistics(
    rows: list[dict[str, str | float]], *, directional: bool
) -> dict[str, float | int | None]:
    x, y = [float(r["itza"]) for r in rows], [float(r["reference"]) for r in rows]
    # Only adjacent calendar years count as year-on-year changes. Missing years are not bridged.
    changes = [
        (x[i] - x[i - 1], y[i] - y[i - 1])
        for i in range(1, len(rows))
        if directional and int(str(rows[i]["period"])) == int(str(rows[i - 1]["period"])) + 1
    ]
    # Ties are reported separately, not counted as agreements or disagreements.
    non_ties = [(a, b) for a, b in changes if a != 0 and b != 0]
    return {
        "n": len(rows),
        "bias": None if directional or not rows else mean(a - b for a, b in zip(x, y, strict=True)),
        "rmse": None
        if directional or not rows
        else math.sqrt(mean((a - b) ** 2 for a, b in zip(x, y, strict=True))),
        "spearman": correlation(x, y),
        "direction_agree": sum((a > 0) == (b > 0) for a, b in non_ties),
        "direction_n": len(non_ties),
        "direction_ties": len(changes) - len(non_ties),
    }


def monthly_daily(start: str, values: list[float | None]) -> dict[str, float]:
    """Sum only full observed months; never turn missing days into zero rain or ET."""
    buckets: dict[str, list[float | None]] = {}
    first = date.fromisoformat(start)
    for offset, value in enumerate(values):
        day = first + timedelta(days=offset)
        buckets.setdefault(day.strftime("%Y-%m"), []).append(value)
    return {
        key: sum(v for v in vals if v is not None)
        for key, vals in buckets.items()
        if len(vals) == calendar.monthrange(int(key[:4]), int(key[5:]))[1]
        and all(v is not None and math.isfinite(v) for v in vals)
    }


def seasons(months: dict[str, float], start_month: int) -> dict[str, float]:
    grouped: dict[int, list[float]] = {}
    for period, value in sorted(months.items()):
        year, month = map(int, period.split("-"))
        harvest = year + (month >= start_month) if start_month != 1 else year
        grouped.setdefault(harvest, []).append(value)
    return {str(year): sum(vals) for year, vals in grouped.items() if len(vals) == 12}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> dict[str, Any]:
    replay = json.loads((HERE / "data/replay.json").read_text())
    if replay["source_sha256"] != sha(HERE / "replay.ts"):
        raise ValueError("stale replay exporter: run node pipelines/validation/replay.mjs")
    fields = []
    hashes = {
        "replay.json": sha(HERE / "data/replay.json"),
        "replay.ts": sha(HERE / "replay.ts"),
        "build.py": sha(Path(__file__)),
    }
    hashes["sources.json"] = sha(HERE / "sources.json")
    for path in sorted((HERE / "data/raw").iterdir()):
        if path.is_file():
            hashes[f"raw/{path.name}"] = sha(path)
    for field in replay["fields"]:
        field_id = field["id"]
        bundle_path = ROOT / f"apps/web/public/bundles/{field_id}/bundle.json"
        bundle = json.loads(bundle_path.read_text())
        hashes[f"{field_id}/bundle.json"] = sha(bundle_path)
        if field["bundle_sha256"] != sha(bundle_path):
            raise ValueError("stale replay: run node pipelines/validation/replay.mjs")
        checks = []
        for kind in ("prism", "openet", "quickstats"):
            path = HERE / f"data/{field_id}-{kind}.json"
            source = Capture.model_validate_json(path.read_text())
            if source.source != kind or source.field != field_id:
                raise ValueError("capture belongs to another source or field")
            hashes[path.name] = sha(path)
            reference = {r.period: r.value for r in source.observations if r.value is not None}
            reason = source.reason
            itza: dict[str, float] = {}
            comparison = kind
            provenance: object = None
            if kind == "prism":
                # The requested IMERG check never silently uses POWER fallback rain.
                rain = next(
                    (
                        s
                        for s in bundle["series"]
                        if s["var"] == "precip"
                        and s["provenance"]["source"] == "gpm_imerg_final_daily"
                    ),
                    None,
                )
                if rain:
                    itza = seasons(
                        monthly_daily(
                            rain["start"],
                            [
                                v if q != 2 else None
                                for v, q in zip(rain["values"], rain["quality"], strict=True)
                            ],
                        ),
                        field["agricultural_year_start_month"],
                    )
                    provenance = rain["provenance"]
                else:
                    reason = "missing_imerg"
                reference = seasons(reference, field["agricultural_year_start_month"])
            elif kind == "openet":
                itza = {r["period"]: r["value"] for r in field["et"]}
                provenance = {
                    "source": "ITZA FAO-56 continuous winter wheat counterfactual",
                    "resolution": "daily model, monthly totals; default soil; no irrigation",
                }
            else:
                itza = {str(r["year"]): r["value"] for r in field["scores"]}
                provenance = {
                    "source": "ITZA Season Replay continuous winter wheat counterfactual",
                    "resolution": (
                        "agricultural season ending in harvest year; equal priorities; "
                        "default soil; no irrigation"
                    ),
                }
            periods = sorted(set(itza) & set(reference))
            rows: list[dict[str, str | float]] = [
                {"period": p, "itza": itza[p], "reference": reference[p]} for p in periods
            ]
            checks.append(
                {
                    "kind": comparison,
                    "status": "ready" if rows else "unavailable",
                    "reason": reason if not rows else None,
                    "reference": source.model_dump(mode="json", exclude={"observations"}),
                    "itza": provenance,
                    "period": f"{periods[0]} to {periods[-1]}" if periods else None,
                    "reference_n": len(reference),
                    "reference_period": (
                        f"{min(r.period for r in source.observations)} to "
                        f"{max(r.period for r in source.observations)}"
                        if source.observations
                        else None
                    ),
                    "unmatched_n": len(set(itza) ^ set(reference)),
                    "rows": rows,
                    "statistics": statistics(rows, directional=kind == "quickstats"),
                }
            )
        fields.append({"id": field_id, "checks": checks})
    return {
        "version": 1,
        "hashes": hashes,
        "sources": json.loads((HERE / "sources.json").read_text()),
        "fields": fields,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = ROOT / "apps/web/src/validation/data/cross-checks.json"
    content = json.dumps(build(), indent=2, allow_nan=False) + "\n"
    if args.check:
        if path.read_text() != content:
            raise SystemExit("cross-check artifact is stale")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


if __name__ == "__main__":
    main()
