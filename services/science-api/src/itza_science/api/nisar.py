"""Provisional NISAR SME2 snapshots with same-date regional SMAP comparison."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from itza_science.api.context import PENDING
from itza_science.context.models import SceneQuery, SceneResponse
from itza_science.context.service import ContextService

router = APIRouter(tags=["nisar"])


@router.get(
    "/v1/nisar",
    responses=PENDING,
    summary="Provisional NISAR moisture snapshots and same-date SMAP",
)
async def get_nisar(
    query: Annotated[SceneQuery, Query()], request: Request, response: Response
) -> SceneResponse:
    service: ContextService = request.app.state.context
    result = await service.scenes("nisar", query)
    if result.status == "pending":
        response.status_code = 202
        response.headers["Retry-After"] = "5"
    return result
