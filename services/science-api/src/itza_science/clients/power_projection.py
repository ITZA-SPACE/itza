"""NASA POWER Projection API client (NEX-GDDP-CMIP6, monthly, per model)."""

import asyncio
from statistics import fmean

from pydantic import BaseModel, ValidationError

from itza_science.clients.http import UpstreamClient
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError
from itza_science.core.factors import VARIABLES

SOURCE = "nasa_power_projection"
FILL_VALUE = -999.0
MODELS = ("cesm2", "ec_earth3", "gfdl_esm4", "giss_e2_1_g", "ipsl_cm6a_lr", "mpi_esm1_2_lr")
FUTURE_YEARS = range(2041, 2061)
SSPS = ("ssp126", "ssp245", "ssp370")

# model -> ssp -> canonical variable -> 12 monthly means (Jan..Dec)
Climatology = dict[str, dict[str, dict[str, list[float]]]]


class _ApiInfo(BaseModel):
    version: str


class _Header(BaseModel):
    api: _ApiInfo


class _Properties(BaseModel):
    parameter: dict[str, dict[str, dict[str, float]]]


class _PowerResponse(BaseModel):
    properties: _Properties
    header: _Header


def _monthly_means(series: dict[str, float]) -> list[float] | None:
    by_month: list[list[float]] = [[] for _ in range(12)]
    for stamp, value in series.items():
        if value == FILL_VALUE or len(stamp) != 6 or not stamp.isdigit():
            continue
        month = int(stamp[4:])
        if 1 <= month <= 12:
            by_month[month - 1].append(value)
    if any(not values for values in by_month):
        return None
    return [fmean(values) for values in by_month]


class PowerProjectionClient:
    def __init__(self, http: UpstreamClient, settings: Settings) -> None:
        self._http = http
        self._url = f"{settings.power_base_url}/api/projection/monthly/point"

    async def _fetch_model(
        self, model: str, lat: float, lon: float
    ) -> tuple[str, dict[str, dict[str, list[float]]], str]:
        params: dict[str, str | int | float] = {
            "parameters": ",".join(spec.power_name for spec in VARIABLES.values()),
            "community": "AG",
            "latitude": lat,
            "longitude": lon,
            "start": f"{FUTURE_YEARS[0]}01",
            "end": f"{FUTURE_YEARS[-1]}12",
            "format": "JSON",
            "time-standard": "UTC",
            "model": model,
        }
        raw = await self._http.get_json(SOURCE, self._url, params)
        try:
            parsed = _PowerResponse.model_validate(raw)
        except ValidationError as exc:
            raise UpstreamError(
                SOURCE, "upstream response did not match the expected shape"
            ) from exc
        result: dict[str, dict[str, list[float]]] = {}
        for ssp in SSPS:
            for name, spec in VARIABLES.items():
                series = parsed.properties.parameter.get(spec.power_name, {}).get(ssp)
                means = _monthly_means(series) if series else None
                if means is not None:
                    result.setdefault(ssp, {})[name] = means
        return model, result, parsed.header.api.version

    async def fetch_future(self, lat: float, lon: float) -> tuple[Climatology, str | None]:
        fetched = await asyncio.gather(*(self._fetch_model(m, lat, lon) for m in MODELS))
        climatology = {model: data for model, data, _ in fetched if data}
        version = fetched[0][2] if fetched else None
        return climatology, version
