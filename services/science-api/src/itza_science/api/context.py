"""Landscape context queries; incomplete cold work is a pollable 202 response."""

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response
from fastapi.responses import FileResponse

from itza_science.context.models import (
    GediQuery,
    GediResponse,
    GraceResponse,
    PointQuery,
    SceneQuery,
    SceneResponse,
)
from itza_science.context.service import ContextService

router = APIRouter(prefix="/v1/context", tags=["context"])
Asset = Annotated[str, Path(pattern=r"^[0-9a-f]{64}\.png$")]
PENDING: dict[int | str, dict[str, Any]] = {
    202: {
        "description": "Processing continues; repeat this GET to obtain the cached result.",
        "content": {
            "application/json": {
                "example": {
                    "status": "pending",
                    "coverage_note": "Processing continues; retry the same request.",
                }
            }
        },
    }
}


@router.get("/grace", responses=PENDING, summary="Regional monthly GRACE total water storage")
async def get_grace(
    query: Annotated[PointQuery, Query()], request: Request, response: Response
) -> GraceResponse:
    service: ContextService = request.app.state.context
    result = await service.grace(query)
    if result.status == "pending":
        response.status_code = 202
        response.headers["Retry-After"] = "5"
    return result


@router.get("/gedi", responses=PENDING, summary="Quality-screened GEDI footprints within 2 km")
async def get_gedi(
    query: Annotated[GediQuery, Query()], request: Request, response: Response
) -> GediResponse:
    service: ContextService = request.app.state.context
    result = await service.gedi(query)
    if result.status == "pending":
        response.status_code = 202
        response.headers["Retry-After"] = "5"
    return result


@router.get(
    "/ecostress", responses=PENDING, summary="Recent clear-land ECOSTRESS LST and ESI scenes"
)
async def get_ecostress(
    query: Annotated[SceneQuery, Query()], request: Request, response: Response
) -> SceneResponse:
    service: ContextService = request.app.state.context
    result = await service.scenes("ecostress", query)
    if result.status == "pending":
        response.status_code = 202
        response.headers["Retry-After"] = "5"
    return result


@router.get("/assets/{asset}", include_in_schema=False)
def context_asset(asset: Asset, request: Request) -> FileResponse:
    service: ContextService = request.app.state.context
    path = service.asset(asset)
    if not path.is_file():
        raise HTTPException(404, "context asset not found")
    return FileResponse(
        path, media_type="image/png", headers={"Cache-Control": "public, max-age=604800, immutable"}
    )
