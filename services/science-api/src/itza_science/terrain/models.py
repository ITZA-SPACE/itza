"""Public spatial-output contracts, published through the service's OpenAPI."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from itza_science.contracts.common_schema import Period
from itza_science.contracts.field_bundle_schema import Gap, MultiPolygon, Polygon


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Source(Model):
    source: str
    product: str
    version: str
    resolution_m: float = Field(gt=0)
    period: Period
    method: str
    retrieved: date = Field(default_factory=date.today)
    coarse: bool = False


class Frame(Model):
    date: date
    variable: Literal["ndvi", "moisture"]
    href: str
    bounds: tuple[float, float, float, float]
    source: Source
    width: int = Field(gt=0, le=1024)
    height: int = Field(gt=0, le=1024)
    bytes: int = Field(gt=0, le=150000)


class FrameIndex(Model):
    version: Literal["frames/1.0"] = "frames/1.0"
    grid_resolution_m: Literal[30] = 30
    frames: list[Frame] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)


class SoilBaseline(Model):
    awc_mm_per_m: float = Field(gt=0, le=500)
    curve_number: float = Field(ge=30, le=98)
    source: str = Field(min_length=1)


class SoilScenario(Model):
    awc_mm_per_m: float
    curve_number: float
    baseline_source: str
    method: Literal["Williams 1995 slope adjustment; SWAT 2005 eq. 2.1.1.12"] = (
        "Williams 1995 slope adjustment; SWAT 2005 eq. 2.1.1.12"
    )
    confidence: Literal["low"] = "low"
    label: Literal["model scenario, not measured zone soil"] = (
        "model scenario, not measured zone soil"
    )


class ZoneProperties(Model):
    zone: int = Field(ge=1, le=4)
    area_ha: float = Field(gt=0)
    pixels: int = Field(gt=0)
    ndvi_mean: float
    ndvi_cv: float | None
    peak_doy: float
    slope_deg: float | None
    flow_accumulation_cells: float | None
    moisture: float | None
    stability: float | None = Field(ge=0, le=1)
    notes: list[str]
    soil_water: SoilScenario | None


class ZoneFeature(Model):
    type: Literal["Feature"] = "Feature"
    geometry: Polygon | MultiPolygon
    properties: ZoneProperties


class ZoneCollection(Model):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    enabled: bool
    reason: str | None = None
    features: list[ZoneFeature] = Field(default_factory=list)
    k: int | None = Field(default=None, ge=2, le=4)
    silhouette: float | None = Field(default=None, ge=-1, le=1)
    stability: float | None = Field(default=None, ge=0, le=1)
    stability_method: str = "mean annual adjusted Rand index, negative values clipped to zero"
    years: list[int] = Field(default_factory=list)
    grid_resolution_m: Literal[30] = 30
    provenance: list[Source] = Field(default_factory=list)
    coverage: float = Field(default=0, ge=0, le=1)
    methods_version: Literal["zones/1.0"] = "zones/1.0"
    gaps: list[Gap] = Field(default_factory=list)


class Relief(Model):
    """One field's 3D surface: a height image and an aerial image on the same lon/lat grid."""

    heightmap: str
    imagery: str | None = None
    width: int = Field(gt=1, le=1024)
    height: int = Field(gt=1, le=1024)
    bounds: tuple[float, float, float, float]
    size_m: tuple[float, float]
    min_elevation_m: float
    max_elevation_m: float
    elevation_source: Source
    imagery_source: Source | None = None


class TerrainIndex(Model):
    version: Literal["terrain/1.0"] = "terrain/1.0"
    available: bool
    mean_elevation_m: float | None = None
    mean_slope_deg: float | None = None
    bounds: tuple[float, float, float, float] | None = None
    display_bounds: tuple[float, float, float, float] | None = None
    layers: dict[str, str] = Field(default_factory=dict)
    flow_lines: dict[str, Any] = Field(
        default_factory=lambda: {
            "type": "FeatureCollection",
            "features": [],
        }
    )
    provenance: Source | None = None
    relief: Relief | None = None
    gaps: list[Gap] = Field(default_factory=list)
