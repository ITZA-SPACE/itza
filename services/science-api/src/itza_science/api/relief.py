"""The detailed 3D surface of a field, straight from its outline (no bundle needed)."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from itza_science.contracts.field_bundle_schema import Gap
from itza_science.core.field import Geometry, field_id
from itza_science.terrain.grid import SpatialLimitError
from itza_science.terrain.models import Relief
from itza_science.terrain.service import SpatialService

router = APIRouter(prefix="/v1/relief", tags=["terrain"])
FieldKey = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]
Asset = Annotated[str, Path(pattern=r"^[0-9a-f]{64}\.(png|jpg)$")]


class ReliefRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: Geometry


class ReliefResponse(BaseModel):
    """`relief` is null when no elevation source covers the field; `gaps` says what was used."""

    relief: Relief | None
    gaps: list[Gap] = Field(default_factory=list)


@router.post("")
async def create_relief(body: ReliefRequest, request: Request) -> ReliefResponse:
    """Builds the package on the first call for a field (up to a minute), then serves the cache."""
    service: SpatialService = request.app.state.spatial
    key = field_id(body.geometry).removeprefix("sha256:")
    try:
        relief, gaps = await service.relief(body.geometry, f"/v1/relief/{key}/")
    except SpatialLimitError as exc:
        raise HTTPException(422, str(exc)) from exc
    return ReliefResponse(relief=relief, gaps=gaps)


@router.get("/{field_key}/{asset}")
def relief_asset(field_key: FieldKey, asset: Asset, request: Request) -> FileResponse:
    service: SpatialService = request.app.state.spatial
    path = service.asset("terrain-" + field_key, asset)
    if not path.is_file():
        raise HTTPException(404, "relief asset not found")
    return FileResponse(
        path,
        media_type="image/png" if asset.endswith(".png") else "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
