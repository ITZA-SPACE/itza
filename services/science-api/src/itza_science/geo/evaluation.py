"""Scoring helpers for judging boundary proposals against hand-drawn reference outlines."""

import json
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Literal

import numpy as np
from shapely.geometry import Point, Polygon, shape
from shapely.geometry.base import BaseGeometry

Outcome = Literal["accepted", "rejected", "no_proposal"]
RefusalKind = Literal["no-field", "timeout", "unavailable"]
REFUSAL_KINDS: tuple[RefusalKind, ...] = ("no-field", "timeout", "unavailable")
TARGET = 0.7
"""Share of clicks that must be accepted without edits (F-24)."""
MIN_FIELDS = 10
"""Reference outlines wanted per region."""


def iou(proposal: BaseGeometry, reference: BaseGeometry) -> float:
    """Intersection over union of two outlines; 0 when they do not overlap."""
    union = proposal.union(reference).area
    return float(proposal.intersection(reference).area / union) if union > 0 else 0.0


def sample_clicks(
    reference: Polygon, per_side: int, inset: float = 0.2
) -> list[tuple[float, float]]:
    """A `per_side` x `per_side` grid of points inside the outline, away from its edges.

    The grid spans the bounding box shrunk by `inset` on every side; points outside the outline
    (concave fields) are dropped, so a click always lands in the field it is scored against.
    """
    if per_side < 1 or not 0 <= inset < 0.5:
        raise ValueError("per_side must be at least 1 and inset in [0, 0.5)")
    west, south, east, north = reference.bounds
    xs = np.linspace(west + inset * (east - west), east - inset * (east - west), per_side)
    ys = np.linspace(south + inset * (north - south), north - inset * (north - south), per_side)
    return [(float(x), float(y)) for x in xs for y in ys if reference.contains(Point(x, y))]


@dataclass(frozen=True)
class ClickResult:
    field: str
    lon: float
    lat: float
    outcome: Outcome
    iou: float | None = None
    reason: str | None = None
    kind: str | None = None
    """Why there was no proposal: `no-field`, `timeout` or `unavailable` (the job's error kind)."""


def classify(
    field: str,
    click: tuple[float, float],
    proposal: BaseGeometry | None,
    reference: BaseGeometry,
    threshold: float,
) -> ClickResult:
    """Accepted when the proposal overlaps the reference by at least `threshold` IoU.

    With no proposal the result is `no_proposal`; the caller adds the reason with `replace`.
    """
    lon, lat = click
    if proposal is None:
        return ClickResult(field, lon, lat, "no_proposal")
    score = iou(proposal, reference)
    return ClickResult(field, lon, lat, "accepted" if score >= threshold else "rejected", score)


def acceptance_rate(results: list[ClickResult]) -> float:
    """Share of all clicks, including those with no proposal, that were accepted."""
    return sum(r.outcome == "accepted" for r in results) / len(results) if results else 0.0


class ReferenceError(ValueError):
    """A reference outline file that cannot be used for scoring."""


@dataclass(frozen=True)
class ReferenceSet:
    """Hand-drawn outlines of one region, with the imagery they were drawn on."""

    region: str
    outlines: dict[str, Polygon]
    imagery: dict[str, str]
    drawn_on: dict[str, str]


def parse_references(collection: dict[str, Any], default_region: str) -> ReferenceSet:
    """Validates a GeoJSON FeatureCollection of reference outlines.

    Every feature is a valid Polygon in longitude/latitude with a unique `name`, the `imagery` it
    was drawn on and the ISO `date` of that imagery, so a score can always be traced to its source.
    The region comes from the collection's `region` member, else `default_region`.
    """
    if collection.get("type") != "FeatureCollection" or not collection.get("features"):
        raise ReferenceError("expected a non-empty FeatureCollection")
    outlines: dict[str, Polygon] = {}
    imagery: dict[str, str] = {}
    drawn_on: dict[str, str] = {}
    for index, feature in enumerate(collection["features"], start=1):
        where = f"feature {index}"
        props = feature.get("properties") or {}
        name = props.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ReferenceError(f"{where} needs a name")
        if name in outlines:
            raise ReferenceError(f"{where}: duplicate name {name!r}")
        outline = shape(feature.get("geometry") or {})
        if not isinstance(outline, Polygon) or outline.is_empty or not outline.is_valid:
            raise ReferenceError(f"{where} ({name}) is not a valid Polygon")
        west, south, east, north = outline.bounds
        if west < -180 or east > 180 or south < -90 or north > 90:
            raise ReferenceError(f"{where} ({name}) is outside longitude/latitude range")
        source = props.get("imagery")
        if not isinstance(source, str) or not source.strip():
            raise ReferenceError(f"{where} ({name}) needs the imagery it was drawn on")
        try:
            date.fromisoformat(str(props.get("date")))
        except ValueError as exc:
            raise ReferenceError(f"{where} ({name}) needs the imagery date as YYYY-MM-DD") from exc
        outlines[name] = outline
        imagery[name] = source
        drawn_on[name] = str(props["date"])
    region = collection.get("region")
    return ReferenceSet(
        region=region if isinstance(region, str) and region else default_region,
        outlines=outlines,
        imagery=imagery,
        drawn_on=drawn_on,
    )


def result_key(result: ClickResult) -> tuple[str, float, float]:
    """Identifies a click, so a resumed run does not repeat it."""
    return (result.field, round(result.lon, 7), round(result.lat, 7))


def dump_result(result: ClickResult) -> str:
    """One result as a JSON line."""
    return json.dumps(asdict(result), sort_keys=True)


def load_results(text: str) -> list[ClickResult]:
    """Results from JSON lines written by `dump_result`; blank lines are skipped."""
    return [ClickResult(**json.loads(line)) for line in text.splitlines() if line.strip()]


@dataclass(frozen=True)
class IouSpread:
    minimum: float
    p25: float
    median: float
    p75: float
    maximum: float


@dataclass(frozen=True)
class Summary:
    """What a region's clicks came to."""

    region: str
    fields: int
    clicks: int
    accepted: int
    rejected: int
    refused: dict[str, int] = field(default_factory=dict)
    iou: IouSpread | None = None

    @property
    def share(self) -> float:
        return self.accepted / self.clicks if self.clicks else 0.0


def summarize(region: str, results: list[ClickResult]) -> Summary:
    """Counts accepted, rejected and refused clicks, with the IoU spread of proposals."""
    scores = [r.iou for r in results if r.iou is not None]
    spread = None
    if scores:
        low, p25, median, p75, high = (
            float(x) for x in np.percentile(scores, [0, 25, 50, 75, 100])
        )
        spread = IouSpread(low, p25, median, p75, high)
    refused = Counter(r.kind or "unavailable" for r in results if r.outcome == "no_proposal")
    return Summary(
        region=region,
        fields=len({r.field for r in results}),
        clicks=len(results),
        accepted=sum(r.outcome == "accepted" for r in results),
        rejected=sum(r.outcome == "rejected" for r in results),
        refused={kind: refused.get(kind, 0) for kind in REFUSAL_KINDS},
        iou=spread,
    )


def worst_fields(results: list[ClickResult], count: int = 5) -> list[tuple[str, float]]:
    """Fields with the lowest accepted share, as (name, share), for the failure-mode notes."""
    by_field: dict[str, list[ClickResult]] = {}
    for r in results:
        by_field.setdefault(r.field, []).append(r)
    ranked = sorted(
        ((name, acceptance_rate(rs)) for name, rs in by_field.items()), key=lambda x: x[1]
    )
    return ranked[:count]


def render_report(summaries: list[Summary], threshold: float) -> str:
    """A Markdown table per run: one row per region, with the verdict against the 70 % target."""
    lines = [
        f"Accepted = proposal IoU >= {threshold} with the reference outline, without edits.",
        "",
        "| Region | Fields | Clicks | Accepted | Rejected | No field | Timeout | Unavailable "
        "| IoU min / median / max |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for s in summaries:
        spread = (
            f"{s.iou.minimum:.2f} / {s.iou.median:.2f} / {s.iou.maximum:.2f}" if s.iou else "n/a"
        )
        lines.append(
            f"| {s.region} | {s.fields} | {s.clicks} | {s.accepted} ({s.share:.0%}) | {s.rejected} "
            f"| {s.refused['no-field']} | {s.refused['timeout']} | {s.refused['unavailable']} "
            f"| {spread} |"
        )
    lines.append("")
    for s in summaries:
        verdict = "meets" if s.share >= TARGET else "misses"
        lines.append(f"- {s.region} {verdict} the {TARGET:.0%} target (F-24).")
    return "\n".join(lines)


def check_field_count(references: ReferenceSet, minimum: int = MIN_FIELDS) -> None:
    """Raises when a region has fewer reference outlines than the evaluation needs."""
    if len(references.outlines) < minimum:
        have = len(references.outlines)
        raise ReferenceError(
            f"{references.region} has {have} outlines; at least {minimum} are needed"
        )
