"""Public context contracts; FastAPI publishes the schemas and examples."""

from datetime import date
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator
from shapely.geometry import box

from itza_science.contracts.common_schema import Period
from itza_science.core.field import area_ha
from itza_science.terrain.models import Model, Source

BBox = tuple[float, float, float, float]


class BoxQuery(Model):
    bbox: str = Field(examples=["5.328,36.118,5.332,36.122"])

    def bounds(self) -> BBox:
        values = tuple(float(v.strip()) for v in self.bbox.split(","))
        if len(values) != 4:
            raise ValueError("bbox requires west,south,east,north")
        west, south, east, north = values
        if not (-180 <= west < east <= 180 and -80 < south < north < 84):
            raise ValueError("bbox must be ordered, finite and within UTM coverage")
        if east - west > 2 or north - south > 2 or area_ha(box(*values)) > 10000:
            raise ValueError("bbox must cover at most 10000 hectares")
        return west, south, east, north

    @model_validator(mode="after")
    def validate_bounds(self) -> "BoxQuery":
        self.bounds()
        return self


class SceneQuery(BoxQuery):
    start: date = Field(alias="from", examples=["2026-06-17"])
    end: date = Field(alias="to", examples=["2026-11-12"])
    limit: int = Field(default=4, ge=1, le=8)
    refresh: bool = False

    @model_validator(mode="after")
    def validate_period(self) -> "SceneQuery":
        if self.start > self.end or (self.end - self.start).days > 5 * 366:
            raise ValueError("from/to must be ordered and span at most five years")
        return self


class PointQuery(Model):
    lat: float = Field(ge=-90, le=90, examples=[36.12])
    lon: float = Field(ge=-180, le=180, examples=[5.33])
    refresh: bool = False


class GediQuery(BoxQuery):
    limit: int = Field(default=4, ge=1, le=8)
    refresh: bool = False


class Quality(Model):
    scope: Literal["native clipping window"] = "native clipping window"
    policy: str
    flags: dict[str, int] = Field(default_factory=dict)
    valid_pixels: int = Field(ge=0)
    total_pixels: int = Field(ge=0)


class Stats(Model):
    mean: float
    minimum: float
    maximum: float
    unit: str
    coverage: float = Field(ge=0, le=1)


class Comparison(Model):
    date: date
    value: float | None
    unit: Literal["m3/m3"] = "m3/m3"
    provenance: Source | None = None
    coverage_note: str


class Snapshot(Model):
    date: date
    scene_id: str
    variable: Literal["soil_moisture", "esi", "lst"]
    stats: Stats
    quality: Quality
    provenance: Source
    href: str
    bounds: BBox
    bytes: int = Field(gt=0, le=150000)
    provisional: bool = False
    smap: Comparison | None = None


class SceneResponse(Model):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "empty",
                    "scenes": [],
                    "coverage_note": "No quality-screened pixels overlap the requested field.",
                    "gaps": ["No observations available."],
                    "truncated": False,
                }
            ]
        }
    )
    status: Literal["ok", "empty", "pending"] = "empty"
    scenes: list[Snapshot] = Field(default_factory=list)
    coverage_note: str
    gaps: list[str] = Field(default_factory=list)
    truncated: bool = False


class MonthlyValue(Model):
    date: date
    anomaly_cm: float | None


class GraceResponse(Model):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "empty",
                    "series": [],
                    "coverage_note": "Regional total water storage, about 300 km resolution.",
                    "message": "No valid GRACE observations cover this location.",
                    "gaps": [],
                }
            ]
        }
    )
    status: Literal["ok", "empty", "pending"] = "empty"
    series: list[MonthlyValue] = Field(default_factory=list)
    trend_cm_per_year: float | None = None
    period: Period | None = None
    provenance: Source | None = None
    grid_spacing_degrees: float = 0.5
    coverage_note: str = (
        "Regional total water storage, approximately 300 km effective resolution; "
        "not field groundwater."
    )
    message: str = "No valid GRACE observations cover this location."
    gaps: list[str] = Field(default_factory=list)


class PointGeometry(Model):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class FootprintProperties(Model):
    shot_number: str
    date: date
    height_m: float | None = None
    cover_fraction: Annotated[float, Field(ge=0, le=1)] | None = None
    on_field: bool
    products: list[str]


class Footprint(Model):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: FootprintProperties


class GediResponse(Model):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "type": "FeatureCollection",
                    "status": "empty",
                    "features": [],
                    "coverage_note": "Sparse 25 m footprints within 2 km; no overlap.",
                    "gaps": [],
                }
            ]
        }
    )
    type: Literal["FeatureCollection"] = "FeatureCollection"
    status: Literal["ok", "empty", "pending"] = "empty"
    features: list[Footprint] = Field(default_factory=list)
    height_mean_m: float | None = None
    cover_mean_fraction: float | None = None
    on_field_count: int = Field(default=0, ge=0)
    tree_structure_hint: str = "No reliable woody-structure evidence in the sampled footprints."
    coverage_note: str = (
        "Sparse 25 m footprints within 2 km; not continuous field coverage or a tree-row map."
    )
    provenance: list[Source] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    truncated: bool = False
