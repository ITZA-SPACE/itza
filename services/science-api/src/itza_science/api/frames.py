"""Dated colorized image frames and a validated index for the field twin."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import FileResponse

from itza_science.api.bundles import _find_job
from itza_science.terrain.grid import SpatialLimitError
from itza_science.terrain.models import FrameIndex
from itza_science.terrain.service import SpatialService

router = APIRouter(prefix="/v1/bundles", tags=["frames"])
BundleId = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]
Asset = Annotated[str, Path(pattern=r"^[0-9a-f]{64}\.png$")]


@router.get("/{bundle_id}/frames")
@router.get("/{bundle_id}/frames/index.json")
async def get_frames(bundle_id: BundleId, request: Request, refresh: bool = False) -> FrameIndex:
    job = _find_job(request, bundle_id)
    if job is None or job.bundle is None:
        raise HTTPException(404, "bundle not found or not ready")
    service: SpatialService = request.app.state.spatial
    try:
        return await service.frame_index(bundle_id, job.bundle, refresh)
    except SpatialLimitError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/{bundle_id}/frames/{asset}")
def frame_asset(bundle_id: BundleId, asset: Asset, request: Request) -> FileResponse:
    if _find_job(request, bundle_id) is None:
        raise HTTPException(404, "bundle not found")
    service: SpatialService = request.app.state.spatial
    path = service.asset("frames-" + bundle_id, asset)
    if not path.is_file():
        raise HTTPException(404, "frame not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
