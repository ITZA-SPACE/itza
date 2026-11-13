"""Serve bounded, verified precomputed class maps without a torch runtime."""

from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
import rasterio
from fastapi import APIRouter, HTTPException, Request
from fastapi import Path as PathParam
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix="/v1/prithvi", tags=["prithvi"])
BundleId = Annotated[str, PathParam(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(min_length=1)
    resolution: str = Field(min_length=1)
    period: str = Field(min_length=1)


class Season(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int = Field(ge=2000, le=2100)
    file: str = Field(pattern=r"^prithvi-[0-9]{4}\.tif$")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    provenance: list[Source] = Field(min_length=1)

    @model_validator(mode="after")
    def matching_year(self) -> "Season":
        if self.file != f"prithvi-{self.year}.tif":
            raise ValueError("raster filename must match the season")
        return self


class Publication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["prithvi/1"] = "prithvi/1"
    bundle_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    model: str = Field(min_length=1)
    checkpoint_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    classes: dict[str, str]
    seasons: list[Season] = Field(max_length=101)
    gaps: list[str]
    limitations: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_seasons(self) -> "Publication":
        if len({season.year for season in self.seasons}) != len(self.seasons):
            raise ValueError("duplicate seasons")
        if self.classes != {"0": "no data", "1": "crop", "2": "fallow or idle cropland"}:
            raise ValueError("unknown class legend")
        return self


def directory(request: Request, bundle_id: str) -> Path:
    root: Path = request.app.state.prithvi_directory
    target = (root / bundle_id).resolve()
    if target.parent != root.resolve():
        raise HTTPException(status_code=404, detail="Prithvi bundle unavailable")
    return target


def publication(request: Request, bundle_id: str) -> Publication:
    try:
        path = directory(request, bundle_id) / "prithvi.json"
        if path.is_symlink() or path.stat().st_size > 100_000:
            raise ValueError("invalid publication")
        result = Publication.model_validate_json(path.read_bytes())
        if result.bundle_id != bundle_id:
            raise ValueError("bundle id mismatch")
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prithvi bundle unavailable") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Prithvi publication invalid") from exc


@router.get("/{bundle_id}")
def metadata(request: Request, bundle_id: BundleId) -> Publication:
    return publication(request, bundle_id)


@router.get("/{bundle_id}/rasters/{year}", response_class=Response)
def raster(
    request: Request, bundle_id: BundleId, year: Annotated[int, PathParam(ge=2000, le=2100)]
) -> Response:
    manifest = publication(request, bundle_id)
    season = next((item for item in manifest.seasons if item.year == year), None)
    if season is None:
        raise HTTPException(status_code=404, detail="Prithvi season unavailable")
    try:
        path = directory(request, bundle_id) / season.file
        if path.is_symlink() or path.stat().st_size > 150_000:
            raise ValueError("invalid raster size")
        content = path.read_bytes()
        if sha256(content).hexdigest() != season.sha256:
            raise ValueError("raster checksum mismatch")
        with rasterio.MemoryFile(content) as memory, memory.open() as src:
            if (
                src.count != 1
                or src.crs is None
                or src.width * src.height > 1_000_000
                or src.dtypes != ("uint8",)
                or src.nodata != 0
                or not np.isin(src.read(1), [0, 1, 2]).all()
            ):
                raise ValueError("invalid class raster")
    except (OSError, ValueError, rasterio.errors.RasterioError) as exc:
        raise HTTPException(status_code=503, detail="Prithvi raster invalid") from exc
    return Response(
        content=content,
        media_type="image/tiff; application=geotiff",
        headers={"ETag": f'"{season.sha256}"'},
    )
