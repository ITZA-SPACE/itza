"""GET /v1/projection: monthly climate change factors for 2041-2060 vs 1995-2014."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from itza_science.cache.files import FileCache
from itza_science.clients.baseline import (
    BASELINE_PERIOD,
    FUTURE_PERIOD,
    BaselineRecord,
    BaselineStore,
    cell_center,
)
from itza_science.clients.baseline import SOURCE as BASELINE_SOURCE
from itza_science.clients.power_projection import SSPS, Climatology, PowerProjectionClient
from itza_science.core.errors import Gap, UpstreamError
from itza_science.core.factors import CORE_VARIABLES, VARIABLES, Kind, monthly_factors, spread

router = APIRouter(tags=["projection"])

Ssp = Literal["ssp126", "ssp245", "ssp370"]
CACHE_NAMESPACE = "projection"
RESPONSE_VERSION = "1"


class VariableFactors(BaseModel):
    kind: Kind
    unit: str
    models: int
    median: list[float]
    min: list[float]
    max: list[float]


class Provenance(BaseModel):
    source: str
    source_version: str | None
    path: Literal["power", "archive"]
    resolution_deg: float
    baseline_period: str
    future_period: str
    baseline_table_version: str
    models: list[str]


class ProjectionResponse(BaseModel):
    lat: float
    lon: float
    cell_lat: float
    cell_lon: float
    months: Literal["index 0 = January"] = "index 0 = January"
    scenarios: dict[str, dict[str, VariableFactors]]
    provenance: Provenance
    gaps: list[Gap]


def assemble(
    ssps: tuple[str, ...], future: Climatology, record: BaselineRecord
) -> tuple[dict[str, dict[str, VariableFactors]], list[str], list[Gap]]:
    models = sorted(set(future) & set(record.models))
    scenarios: dict[str, dict[str, VariableFactors]] = {}
    gaps: list[Gap] = []
    for ssp in ssps:
        out: dict[str, VariableFactors] = {}
        for name, spec in VARIABLES.items():
            per_model = [
                monthly_factors(spec.kind, base, fut)
                for m in models
                if (base := record.models[m].baseline.get(name))
                and (fut := future[m].get(ssp, {}).get(name))
            ]
            if not per_model:
                if name in CORE_VARIABLES:
                    gaps.append(
                        Gap(var=f"{ssp}.{name}", reason="no model data", severity="warning")
                    )
                continue
            s = spread(per_model)
            out[name] = VariableFactors(
                kind=spec.kind,
                unit=spec.unit,
                models=len(per_model),
                median=s.median,
                min=s.low,
                max=s.high,
            )
        scenarios[ssp] = out
    return scenarios, models, gaps


async def build_projection(
    lat: float,
    lon: float,
    ssps: tuple[str, ...],
    power: PowerProjectionClient,
    store: BaselineStore,
) -> ProjectionResponse:
    cell_lat, cell_lon = cell_center(lat, lon)
    record = store.load(cell_lat, cell_lon)
    if record is None:
        raise UpstreamError(
            BASELINE_SOURCE,
            f"no precomputed baseline for the 0.25 degree cell {cell_lat}, {cell_lon}",
        )
    future, version = await power.fetch_future(lat, lon)
    if future:
        path: Literal["power", "archive"] = "power"
        source = "NASA POWER Projection API (NEX-GDDP-CMIP6)"
    else:
        path = "archive"
        source = "NEX-GDDP-CMIP6 archive (precomputed)"
        version = record.version
        future = {m: c.future for m, c in record.models.items() if c.future}
        if not future:
            raise UpstreamError(
                BASELINE_SOURCE, "POWER has no projection data here and no archive future is stored"
            )
    scenarios, models, gaps = assemble(ssps, future, record)
    if not models or not any(scenarios.values()):
        raise UpstreamError(
            "projection", "no model has both future and baseline data for this point"
        )
    return ProjectionResponse(
        lat=lat,
        lon=lon,
        cell_lat=cell_lat,
        cell_lon=cell_lon,
        scenarios=scenarios,
        provenance=Provenance(
            source=source,
            source_version=version,
            path=path,
            resolution_deg=0.25,
            baseline_period=BASELINE_PERIOD,
            future_period=FUTURE_PERIOD,
            baseline_table_version=record.version,
            models=models,
        ),
        gaps=gaps,
    )


@router.get("/v1/projection")
async def get_projection(
    request: Request,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    ssp: Ssp | None = None,
) -> ProjectionResponse:
    state = request.app.state
    cache: FileCache = state.cache
    ssps: tuple[str, ...] = (ssp,) if ssp else SSPS
    key = FileCache.key(
        CACHE_NAMESPACE, RESPONSE_VERSION, {"lat": round(lat, 4), "lon": round(lon, 4), "ssp": ssps}
    )
    cached = cache.get(CACHE_NAMESPACE, key)
    if cached is not None:
        return ProjectionResponse.model_validate(cached)
    response = await build_projection(lat, lon, ssps, state.power_projection, state.baselines)
    cache.set(CACHE_NAMESPACE, key, response.model_dump(mode="json"))
    return response
