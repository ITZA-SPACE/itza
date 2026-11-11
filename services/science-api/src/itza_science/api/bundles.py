"""Field Data Bundle service: POST /v1/bundles, GET /v1/bundles/{id}[/series/{var}].

Builds a bundle from the three server adapters (IMERG, SMAP L4, HLS VI),
validated by construction against the generated ``FieldBundle`` contract.
Adapter failures never raise past this layer; they become ``gaps[]``.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from itza_science.adapters.base import DataAdapter, FetchResult, Period
from itza_science.cache.files import FileCache
from itza_science.contracts.canonical_series_schema import CanonicalSeries, Var
from itza_science.contracts.field_bundle_schema import (
    FieldBundle,
    Layers,
    MultiPolygon,
    Polygon,
)
from itza_science.contracts.field_bundle_schema import FieldModel as BundleField
from itza_science.contracts.field_bundle_schema import Gap as BundleGap
from itza_science.core.errors import Gap
from itza_science.core.field import area_ha, centroid, field_id, to_shapely
from itza_science.core.jobs import BundleJob, BundleJobStore

router = APIRouter(tags=["bundles"])

CACHE_NAMESPACE = "bundles"
RESPONSE_VERSION = "1"
MAX_VERTICES = 500
MAX_AREA_HA = 10_000.0
"""Conservative cap: this service targets individual farm fields, not regions;
10,000 ha keeps HLS clipping (one ~30 m pixel per ~0.09 ha) and per-day adapter
calls bounded for a background job."""
MAX_PERIOD_DAYS = 5 * 365
SUPPORTED_VARS = (Var.precip, Var.sm_surface, Var.sm_rootzone, Var.ndvi)

_LON_RANGE = (-180.0, 180.0)
_LAT_RANGE = (-90.0, 90.0)


def _check_positions(geometry: Polygon | MultiPolygon) -> Polygon | MultiPolygon:
    rings = (
        geometry.coordinates
        if isinstance(geometry, Polygon)
        else [ring for poly in geometry.coordinates for ring in poly]
    )
    count = 0
    for ring in rings:
        count += len(ring)
        for lon, lat, *_rest in ring:
            if not (_LON_RANGE[0] <= lon <= _LON_RANGE[1]):
                raise ValueError(f"longitude {lon} out of range")
            if not (_LAT_RANGE[0] <= lat <= _LAT_RANGE[1]):
                raise ValueError(f"latitude {lat} out of range")
    if count > MAX_VERTICES:
        raise ValueError(f"polygon has {count} vertices, the cap is {MAX_VERTICES}")
    area = area_ha(to_shapely(geometry))
    if area > MAX_AREA_HA:
        raise ValueError(f"field is {area:.0f} ha, the cap is {MAX_AREA_HA:.0f} ha")
    return geometry


Geometry = Annotated[Polygon | MultiPolygon, AfterValidator(_check_positions)]


class PeriodInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date

    @model_validator(mode="after")
    def _check_range(self) -> PeriodInput:
        if self.end < self.start:
            raise ValueError("period.end is before period.start")
        if (self.end - self.start).days > MAX_PERIOD_DAYS:
            raise ValueError(f"period spans more than {MAX_PERIOD_DAYS} days")
        return self


class BundleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: Geometry
    period: PeriodInput
    variables: list[Var] | None = Field(
        default=None, description="Defaults to every variable this service's adapters serve."
    )

    @model_validator(mode="after")
    def _check_variables(self) -> BundleRequest:
        if self.variables is not None:
            unsupported = [v for v in self.variables if v not in SUPPORTED_VARS]
            if unsupported:
                raise ValueError(f"unsupported variables: {unsupported}")
        return self


class BundleAccepted(BaseModel):
    id: str
    status: Literal["queued", "running", "done"]


class FieldSummary(BaseModel):
    id: str
    area_ha: float


class BundleStatusResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "error"]
    field: FieldSummary | None = None
    generated_at: datetime | None = None
    adapters: list[str] | None = None
    gaps: list[BundleGap] | None = None
    error: str | None = None


def _job_response(job: BundleJob) -> BundleStatusResponse:
    if job.bundle is None:
        return BundleStatusResponse(id=job.id, status=job.status, error=job.error)
    return BundleStatusResponse(
        id=job.id,
        status=job.status,
        field=FieldSummary(id=job.bundle.field.id, area_ha=job.bundle.field.area_ha),
        generated_at=job.bundle.generated_at,
        adapters=sorted({s.provenance.source for s in job.bundle.series}),
        gaps=job.bundle.gaps,
    )


def _bundle_cache_key(the_field_id: str, period: PeriodInput, variables: tuple[Var, ...]) -> str:
    return FileCache.key(
        CACHE_NAMESPACE,
        RESPONSE_VERSION,
        {
            "field": the_field_id,
            "start": period.start.isoformat(),
            "end": period.end.isoformat(),
            "vars": sorted(v.value for v in variables),
        },
    )


async def _build_bundle(
    request: BundleRequest,
    the_field_id: str,
    variables: tuple[Var, ...],
    adapters: Sequence[DataAdapter],
) -> FieldBundle:
    shapely_geometry = to_shapely(request.geometry)
    period = Period(start=request.period.start, end=request.period.end)
    results: list[FetchResult] = await asyncio.gather(
        *(
            adapter.fetch(shapely_geometry, period, variables)
            for adapter in adapters
            if any(v in adapter.capabilities().variables for v in variables)
        )
    )
    series: list[CanonicalSeries] = []
    gaps: list[Gap] = []
    for result in results:
        series.extend(result.series)
        gaps.extend(result.gaps)
    return FieldBundle(
        schema="field-bundle/1.0",  # type: ignore[call-arg]  # alias; mypy's plugin wants schema_
        field=BundleField(
            id=the_field_id,
            geometry=request.geometry,
            area_ha=area_ha(shapely_geometry),
            centroid=list(centroid(shapely_geometry)),
            elevation_m=0.0,
            slope_mean_deg=0.0,
        ),
        generated_at=datetime.now(UTC),
        series=series,
        phenology=[],
        layers=Layers(),
        context={},
        soil={},
        gaps=[
            *(BundleGap(var=g.var, reason=g.reason, severity=g.severity) for g in gaps),
            BundleGap(
                var="elevation",
                reason="elevation and slope are not computed by this service yet",
                severity="info",
            ),
        ],
    )


@dataclass(frozen=True)
class _JobInputs:
    the_field_id: str
    request: BundleRequest
    adapters: Sequence[DataAdapter]


async def _run_job(
    jobs: BundleJobStore, cache: FileCache, bundle_id: str, job_inputs: _JobInputs
) -> None:
    job = jobs.get(bundle_id)
    if job is None:
        return
    job.status = "running"
    try:
        request = job_inputs.request
        variables = tuple(request.variables) if request.variables else SUPPORTED_VARS
        bundle = await _build_bundle(
            request, job_inputs.the_field_id, variables, job_inputs.adapters
        )
    except Exception as exc:
        job.status = "error"
        job.error = str(exc)
        return
    job.status = "done"
    job.bundle = bundle
    cache.set(CACHE_NAMESPACE, bundle_id, bundle.model_dump(mode="json", by_alias=True))


@router.post("/v1/bundles")
async def create_bundle(
    request: BundleRequest, http_request: Request, background_tasks: BackgroundTasks
) -> BundleAccepted:
    state = http_request.app.state
    jobs: BundleJobStore = state.bundle_jobs
    cache: FileCache = state.cache
    the_field_id = field_id(request.geometry)
    variables = tuple(request.variables) if request.variables else SUPPORTED_VARS
    bundle_id = _bundle_cache_key(the_field_id, request.period, variables)

    job = jobs.get(bundle_id)
    if job is None:
        cached = cache.get(CACHE_NAMESPACE, bundle_id)
        if cached is not None:
            bundle = FieldBundle.model_validate(cached)
            job = BundleJob(
                id=bundle_id, status="done", created_at=datetime.now(UTC), bundle=bundle
            )
            jobs.restore(job)
            return BundleAccepted(id=bundle_id, status="done")

    job, created = await jobs.get_or_create(bundle_id, datetime.now(UTC))
    if created:
        adapters: Sequence[DataAdapter] = state.bundle_adapters
        job_inputs = _JobInputs(the_field_id=the_field_id, request=request, adapters=adapters)
        background_tasks.add_task(_run_job, jobs, cache, bundle_id, job_inputs)
    status: Literal["queued", "running", "done"] = job.status if job.status != "error" else "queued"
    return BundleAccepted(id=bundle_id, status=status)


@router.get("/v1/bundles/{bundle_id}")
async def get_bundle(bundle_id: str, http_request: Request) -> BundleStatusResponse:
    jobs: BundleJobStore = http_request.app.state.bundle_jobs
    job = jobs.get(bundle_id)
    if job is None:
        cache: FileCache = http_request.app.state.cache
        cached = cache.get(CACHE_NAMESPACE, bundle_id)
        if cached is None:
            raise HTTPException(status_code=404, detail="bundle not found")
        bundle = FieldBundle.model_validate(cached)
        job = BundleJob(id=bundle_id, status="done", created_at=datetime.now(UTC), bundle=bundle)
        jobs.restore(job)
    return _job_response(job)


@router.get("/v1/bundles/{bundle_id}/series/{var}")
async def get_bundle_series(bundle_id: str, var: Var, http_request: Request) -> CanonicalSeries:
    jobs: BundleJobStore = http_request.app.state.bundle_jobs
    job = jobs.get(bundle_id)
    if job is None:
        cache: FileCache = http_request.app.state.cache
        cached = cache.get(CACHE_NAMESPACE, bundle_id)
        if cached is None:
            raise HTTPException(status_code=404, detail="bundle not found")
        bundle = FieldBundle.model_validate(cached)
        job = BundleJob(id=bundle_id, status="done", created_at=datetime.now(UTC), bundle=bundle)
        jobs.restore(job)
    if job.status != "done" or job.bundle is None:
        raise HTTPException(status_code=404, detail=f"bundle is {job.status}, not done")
    for one_series in job.bundle.series:
        if one_series.var == var:
            return one_series
    raise HTTPException(status_code=404, detail=f"no {var.value} series in this bundle")
