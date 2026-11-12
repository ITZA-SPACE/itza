"""Click-to-field boundary proposal (F-24): the field around a point, from HLS NDVI behavior.

Method (HLS-based segmentation fallback of TECHNICAL_ARCHITECTURE §8.3): pixels that follow the
same NDVI trajectory through the period as the clicked pixel belong to the same field. The region
grows from the click over 30 m pixels, is cleaned up, and is polygonized. The result is a proposal
the user accepts or edits; it is never stored.
"""

import asyncio
import hashlib
import logging
import warnings
from collections.abc import Callable
from datetime import date, timedelta
from math import floor
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, HTTPException, Path, Request
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pyproj import Transformer
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import Polygon, box, mapping, shape

from itza_science.adapters.base import Period
from itza_science.contracts.common_schema import Period as PeriodModel
from itza_science.terrain.grid import FloatArray, Grid, SpatialLimitError, project
from itza_science.terrain.models import Source
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import Observation

router = APIRouter(tags=["boundaries"])

JOB_TIMEOUT_S = 1800.0
"""Upper bound for one proposal job, including the imagery read (a cold cache takes minutes)."""
MAX_JOBS = 64
logger = logging.getLogger(__name__)
MAX_PERIOD_DAYS = 300
"""Longest period a request may name; longer ones are refused up front, not timed out."""
DEFAULT_PERIOD_DAYS = 270
"""About one growing season (nine months) ending today."""
SAMPLE_STEP_DAYS = 10
SAMPLE_WINDOW_DAYS = 3
"""Imagery is read for a short window every step, not for every scene in the period.

Each HLS granule is a whole 109 km tile that must be downloaded, so reading a season's worth
(hundreds of scenes) takes far longer than a click can wait. A 3-day window every 10 days keeps
about three dozen scenes, enough to tell crops apart by their NDVI trajectory."""
WINDOW_M = 900.0
"""How far from the click the search extends; a field reaching it is reported as unbounded."""
MIN_DATES = 4
MIN_AREA_HA = 0.5
SIMPLIFY_M = 15.0
DISTANCE_THRESHOLD = 0.09
"""RMS NDVI difference from the click's trajectory above which a pixel is another field."""
_PIXEL_HA = 0.09


class BoundaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-80, le=84)
    period: PeriodModel | None = None

    @model_validator(mode="after")
    def _bounded_period(self) -> "BoundaryRequest":
        if self.period is not None:
            days = (self.period.end - self.period.start).days
            if days < 0 or days > MAX_PERIOD_DAYS:
                raise ValueError(
                    f"too much imagery for this period: choose at most {MAX_PERIOD_DAYS} days"
                )
        return self


class BoundaryProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    geometry: dict[str, object]
    area_ha: float
    method: Literal["hls-temporal-segmentation"] = "hls-temporal-segmentation"
    confidence: Literal["high", "medium", "low"]
    separation: float = Field(description="Boundary contrast: outside over inside NDVI distance.")
    dates_used: int
    resolution_m: Literal[30] = 30
    period: PeriodModel
    sources: list[Source]
    note: str = "A proposal from 30 m satellite imagery. Check it and edit before analysing."


class NoFieldFoundError(ValueError):
    """The imagery does not support a field boundary around the click."""


def _seed(distance_stack: NDArray[np.float64], row: int, col: int) -> FloatArray:
    rows = slice(max(row - 1, 0), row + 2)
    cols = slice(max(col - 1, 0), col + 2)
    block = distance_stack[:, rows, cols].reshape(distance_stack.shape[0], -1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # a date with no clear pixel stays NaN
        return np.asarray(np.nanmedian(block, axis=1), dtype=np.float64)


def _distance(stack: NDArray[np.float64], seed: FloatArray) -> FloatArray:
    """RMS NDVI difference to the seed over the dates where both are valid; NaN if too few."""
    diff = stack - seed[:, None, None]
    valid = np.isfinite(diff)
    count = valid.sum(axis=0)
    total = np.where(valid, diff, 0.0) ** 2
    with np.errstate(all="ignore"):
        out = np.sqrt(total.sum(axis=0) / count)
    out[count < MIN_DATES] = np.nan
    return np.asarray(out, dtype=np.float64)


def grow_region(
    stack: NDArray[np.float64], row: int, col: int
) -> tuple[NDArray[np.bool_], float, bool]:
    """The pixels connected to (row, col) that behave like it, their contrast and edge contact."""
    seed = _seed(stack, row, col)
    if int(np.isfinite(seed).sum()) < MIN_DATES:
        raise NoFieldFoundError("the clicked pixel has too few clear observations")
    distance = _distance(stack, seed)
    similar = np.nan_to_num(distance, nan=np.inf) < DISTANCE_THRESHOLD
    similar = ndimage.binary_opening(similar, structure=np.ones((3, 3)))
    labels, _ = ndimage.label(similar)
    label = labels[row, col]
    if label == 0:
        raise NoFieldFoundError("the clicked pixel does not belong to a coherent field")
    region = np.asarray(ndimage.binary_fill_holes(labels == label), dtype=np.bool_)
    ring = ndimage.binary_dilation(region, iterations=2) & ~region
    inside = np.nanmean(distance[region])
    outside = np.nanmean(distance[ring]) if ring.any() else np.nan
    separation = float(outside / max(inside, 0.01)) if np.isfinite(outside) else 0.0
    edges = region[0].any() or region[-1].any() or region[:, 0].any() or region[:, -1].any()
    return region, separation, bool(edges)


def polygonize(region: NDArray[np.bool_], grid: Grid) -> Polygon:
    pieces = [
        shape(geom)
        for geom, value in shapes(region.astype(np.uint8), mask=region, transform=grid.affine)
        if value == 1
    ]
    if not pieces:
        raise NoFieldFoundError("no field outline could be traced")
    largest = max(pieces, key=lambda piece: piece.area)
    simplified = largest.simplify(SIMPLIFY_M, preserve_topology=True)
    if not isinstance(simplified, Polygon) or simplified.is_empty:
        raise NoFieldFoundError("no field outline could be traced")
    return Polygon(simplified.exterior)  # drop interior rings: a field is one polygon


def pixel_of(grid: Grid, lon: float, lat: float) -> tuple[int, int]:
    """Row and column of the pixel holding the point; floor, so points just outside are caught."""
    x, y = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True).transform(lon, lat)
    col, row = (~grid.affine) * (x, y)
    r, c = floor(row), floor(col)
    if not (0 <= r < grid.height and 0 <= c < grid.width):
        raise NoFieldFoundError("the click is outside the imagery")
    return r, c


def _confidence(separation: float) -> Literal["high", "medium", "low"]:
    if separation >= 2.5:
        return "high"
    return "medium" if separation >= 1.6 else "low"


def sample_windows(period: PeriodModel) -> list[Period]:
    """Short date windows spread evenly over the period; the last one may be cut short."""
    windows: list[Period] = []
    day = period.start
    while day <= period.end:
        end = min(day + timedelta(days=SAMPLE_WINDOW_DAYS - 1), period.end)
        windows.append(Period(day, end))
        day += timedelta(days=SAMPLE_STEP_DAYS)
    return windows


def _default_period(today: date) -> PeriodModel:
    return PeriodModel(start=today - timedelta(days=DEFAULT_PERIOD_DAYS), end=today)


async def propose(
    service: SpatialService,
    lon: float,
    lat: float,
    period: PeriodModel,
    on_progress: Callable[[int, int], None] | None = None,
) -> BoundaryProposal:
    """The proposal for a click; `on_progress(done, total)` is called after each date window."""
    seed_geometry = box(lon - 0.0002, lat - 0.0002, lon + 0.0002, lat + 0.0002)
    grid = Grid.for_field(seed_geometry, buffer_m=WINDOW_M)
    key = f"boundary:{lon:.5f},{lat:.5f}"
    ndvi: list[Observation] = []
    windows = sample_windows(period)
    for done, window in enumerate(windows, start=1):
        inputs = await service.source.series(grid, window, key)
        ndvi.extend(item for item in inputs.observations if item.variable == "ndvi")
        if on_progress:
            on_progress(done, len(windows))
    if len(ndvi) < MIN_DATES:
        raise NoFieldFoundError("too few satellite observations for this place and period")
    stack = np.stack([item.values for item in ndvi]).astype(np.float64)
    row, col = pixel_of(grid, lon, lat)
    region, separation, touches_edge = grow_region(stack, row, col)
    area_ha = float(region.sum()) * _PIXEL_HA
    if touches_edge:
        raise NoFieldFoundError("the area around the click is too large or uniform to outline")
    if area_ha < MIN_AREA_HA:
        raise NoFieldFoundError("the area around the click is smaller than half a hectare")
    outline = polygonize(region, grid)
    geographic = project(outline, grid.crs, "EPSG:4326")
    seen: dict[str, Source] = {}
    for item in ndvi:
        seen.setdefault(f"{item.source.product}:{item.source.version}", item.source)
    return BoundaryProposal(
        geometry=dict(mapping(geographic)),
        area_ha=round(area_ha, 2),
        confidence=_confidence(separation),
        separation=round(separation, 2),
        dates_used=len(ndvi),
        period=period,
        sources=list(seen.values()),
    )


ErrorKind = Literal["no-field", "timeout", "unavailable"]


class JobProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    done: int
    total: int


class JobError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ErrorKind
    message: str


class BoundaryJob(BaseModel):
    """A boundary request: poll `GET /v1/boundaries/{id}` until it is done or has failed."""

    model_config = ConfigDict(extra="forbid")

    id: str
    status: Literal["running", "done", "error"]
    progress: JobProgress
    proposal: BoundaryProposal | None = None
    error: JobError | None = None


class BoundaryJobs:
    """In-memory jobs, newest last; finished ones are dropped first when the store is full."""

    def __init__(self) -> None:
        self.jobs: dict[str, BoundaryJob] = {}
        self.tasks: set[asyncio.Task[None]] = set()

    def make_room(self) -> bool:
        while len(self.jobs) >= MAX_JOBS:
            finished = next(
                (key for key, job in self.jobs.items() if job.status != "running"), None
            )
            if finished is None:
                return False
            del self.jobs[finished]
        return True


def job_id(lon: float, lat: float, period: PeriodModel) -> str:
    """Same click (to about 10 m) and period give the same job, so repeats share the work."""
    text = f"{lon:.4f},{lat:.4f},{period.start},{period.end}"
    return hashlib.sha256(text.encode()).hexdigest()[:16]


async def _run(
    job: BoundaryJob, service: SpatialService, lon: float, lat: float, period: PeriodModel
) -> None:
    def progress(done: int, total: int) -> None:
        job.progress = JobProgress(done=done, total=total)

    try:
        async with asyncio.timeout(JOB_TIMEOUT_S):
            job.proposal = await propose(service, lon, lat, period, progress)
        job.status = "done"
    except TimeoutError:
        job.error = JobError(kind="timeout", message="the imagery took too long to read")
        job.status = "error"
    except (NoFieldFoundError, SpatialLimitError) as exc:
        job.error = JobError(kind="no-field", message=str(exc))
        job.status = "error"
    except Exception:
        logger.exception("boundary job %s failed", job.id)
        job.error = JobError(kind="unavailable", message="the imagery could not be read")
        job.status = "error"


def _jobs(request: Request) -> BoundaryJobs:
    state = request.app.state
    if not hasattr(state, "boundary_jobs"):
        state.boundary_jobs = BoundaryJobs()
    jobs: BoundaryJobs = state.boundary_jobs
    return jobs


@router.post("/v1/boundaries", status_code=202)
async def start_boundary(body: BoundaryRequest, request: Request) -> BoundaryJob:
    """Starts (or joins) the job for this click and returns at once, however cold the cache."""
    service: SpatialService = request.app.state.spatial
    period = body.period or _default_period(date.today())
    store = _jobs(request)
    key = job_id(body.lon, body.lat, period)
    existing = store.jobs.get(key)
    if existing is not None and existing.status != "error":
        return existing
    store.jobs.pop(key, None)
    if not store.make_room():
        raise HTTPException(503, "too many boundary requests are running; try again shortly")
    job = BoundaryJob(id=key, status="running", progress=JobProgress(done=0, total=0))
    store.jobs[key] = job
    task = asyncio.create_task(_run(job, service, body.lon, body.lat, period))
    store.tasks.add(task)
    task.add_done_callback(store.tasks.discard)
    return job


@router.get("/v1/boundaries/{job_key}")
async def get_boundary(
    job_key: Annotated[str, Path(pattern=r"^[0-9a-f]{16}$")], request: Request
) -> BoundaryJob:
    job = _jobs(request).jobs.get(job_key)
    if job is None:
        raise HTTPException(404, "no such boundary request; start a new one")
    return job
