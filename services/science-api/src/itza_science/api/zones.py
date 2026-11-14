"""Management zones and terrain overlays for existing fields/bundles."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import FileResponse

from itza_science.adapters.base import Period
from itza_science.api.bundles import BundleRequest, _find_job
from itza_science.core.field import field_id
from itza_science.terrain.grid import SpatialLimitError
from itza_science.terrain.models import SoilBaseline, TerrainIndex, ZoneCollection
from itza_science.terrain.service import SpatialService

router = APIRouter(tags=["zones", "terrain"])
BundleId = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]
Asset = Annotated[str, Path(pattern=r"^[0-9a-f]{64}\.(tif|png)$")]


class ZonesRequest(BundleRequest):
    soil: SoilBaseline | None = None


@router.post("/v1/zones")
async def create_zones(body: ZonesRequest, request: Request) -> ZoneCollection:
    service: SpatialService = request.app.state.spatial
    try:
        return await service.management_zones(
            body.geometry, Period(body.period.start, body.period.end), body.soil, body.refresh
        )
    except SpatialLimitError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/v1/bundles/{bundle_id}/terrain")
async def get_terrain(bundle_id: BundleId, request: Request) -> TerrainIndex:
    job = _find_job(request, bundle_id)
    if job is None or job.bundle is None:
        raise HTTPException(404, "bundle not found or not ready")
    service: SpatialService = request.app.state.spatial
    base = f"/v1/bundles/{bundle_id}/terrain/"
    try:
        return await service.terrain(job.bundle.field.geometry, base)
    except SpatialLimitError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/v1/bundles/{bundle_id}/terrain/{asset}")
def terrain_asset(bundle_id: BundleId, asset: Asset, request: Request) -> FileResponse:
    job = _find_job(request, bundle_id)
    if job is None or job.bundle is None:
        raise HTTPException(404, "bundle not found")

    service: SpatialService = request.app.state.spatial
    group = "terrain-" + field_id(job.bundle.field.geometry).removeprefix("sha256:")
    path = service.asset(group, asset)
    if not path.is_file():
        raise HTTPException(404, "terrain asset not found")
    return FileResponse(
        path,
        media_type="image/png" if asset.endswith(".png") else "image/tiff",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
