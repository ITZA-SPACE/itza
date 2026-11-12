"""Scoring helpers for judging boundary proposals against hand-drawn reference outlines."""

from dataclasses import dataclass
from typing import Literal

import numpy as np
from shapely.geometry import Point, Polygon
from shapely.geometry.base import BaseGeometry

Outcome = Literal["accepted", "rejected", "no_proposal"]


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
