"""Polygon/component/horizon-weighted USDA SSURGO, with per-property SoilGrids fallback."""

from collections import defaultdict
from datetime import UTC, datetime
from itertools import pairwise
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely import from_wkt
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from itza_science.contracts.common_schema import Confidence, Soil, SoilValue
from itza_science.contracts.field_bundle_schema import Gap
from itza_science.core.field import area_ha

SDA = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
SOILGRIDS = "https://rest.isric.org/soilgrids/v2.0/properties/query"
US = box(-125, 24, -66, 50).union(box(-170, 50, -130, 72)).union(box(-161, 18, -154, 23))
DEPTHS = ("0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm")
PROPERTIES = {
    "clay_pct": "claytotal_r",
    "sand_pct": "sandtotal_r",
    "silt_pct": "silttotal_r",
    "om_pct": "om_r",
    "ph": "ph1to1h2o_r",
    "awc_mm_per_m": "awc_r",
}


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Horizon(Model):
    mukey: str
    mupolygonkey: str
    intersection_wkt: str
    areasymbol: str
    survey_version: str
    cokey: str
    comppct_r: float = Field(gt=0, le=100)
    hydgrp: str | None
    drainagecl: str | None
    chkey: str
    hzdept_r: float = Field(ge=0)
    hzdepb_r: float = Field(gt=0)
    claytotal_r: float | None = Field(ge=0, le=100)
    sandtotal_r: float | None = Field(ge=0, le=100)
    silttotal_r: float | None = Field(ge=0, le=100)
    om_r: float | None = Field(ge=0, le=100)
    ph1to1h2o_r: float | None = Field(ge=0, le=14)
    awc_r: float | None = Field(ge=0, le=1)

    @model_validator(mode="after")
    def depth(self) -> "Horizon":
        if self.hzdepb_r <= self.hzdept_r:
            raise ValueError("reversed horizon")
        return self


class SoilResult(Model):
    soil: Soil = Field(default_factory=dict)
    gaps: list[Gap] = Field(default_factory=list)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    hydrologic_groups: dict[str, float] = Field(default_factory=dict)
    drainage_classes: dict[str, float] = Field(default_factory=dict)


def query(geometry: BaseGeometry) -> str:
    if geometry.geom_type not in ("Polygon", "MultiPolygon") or not geometry.is_valid:
        raise ValueError("expected a valid field polygon")
    # WKT is serialized from validated numeric geometry, never interpolated user SQL.
    aoi = f"geometry::STGeomFromText('{geometry.wkt}',4326)"
    return f"""SELECT TOP 5001 mu.mukey, mu.mupolygonkey,
mu.mupolygongeo.STIntersection({aoi}).STAsText() AS intersection_wkt,
l.areasymbol, CAST(sa.saverest AS varchar(30)) AS survey_version,
c.cokey,c.comppct_r,c.hydgrp,c.drainagecl,
h.chkey,h.hzdept_r,h.hzdepb_r,h.claytotal_r,h.sandtotal_r,h.silttotal_r,h.om_r,h.ph1to1h2o_r,h.awc_r
FROM mupolygon mu INNER JOIN mapunit m ON m.mukey=mu.mukey
INNER JOIN legend l ON l.lkey=m.lkey INNER JOIN sacatalog sa ON sa.areasymbol=l.areasymbol
INNER JOIN component c ON c.mukey=m.mukey INNER JOIN chorizon h ON h.cokey=c.cokey
WHERE mu.mupolygongeo.STIntersects({aoi})=1 AND h.hzdept_r<100 AND h.hzdepb_r>0
ORDER BY mu.mupolygonkey,c.cokey,h.hzdept_r"""  # noqa: S608 - numeric Shapely WKT, no user SQL


def add_categories(first: Horizon, component_weight: float, result: SoilResult) -> None:
    for category, destination in (
        (first.hydgrp, result.hydrologic_groups),
        (first.drainagecl, result.drainage_classes),
    ):
        if category:
            destination[category] = destination.get(category, 0) + component_weight


def parse_table(payload: object) -> list[Horizon]:
    if not isinstance(payload, dict) or not isinstance(payload.get("Table"), list):
        raise ValueError("invalid SDA table")
    table = payload["Table"]
    if not 1 < len(table) <= 5001 or set(table[0]) != set(Horizon.model_fields):
        raise ValueError("empty, oversized or unexpected SDA table")
    return [Horizon.model_validate(dict(zip(table[0], row, strict=True))) for row in table[1:]]


def aggregate(payload: object, geometry: BaseGeometry) -> SoilResult:
    rows = parse_table(payload)
    groups: dict[tuple[str, str], list[Horizon]] = defaultdict(list)
    for row in rows:
        groups[row.mupolygonkey, row.cokey].append(row)
    sums: dict[str, float] = defaultdict(float)
    weights: dict[str, float] = defaultdict(float)
    result = SoilResult()
    surveys = set()
    for horizons in groups.values():
        first = horizons[0]
        area = area_ha(from_wkt(first.intersection_wkt).intersection(geometry))
        if area <= 0:
            continue
        component_weight = area * first.comppct_r / 100
        surveys.add((first.areasymbol, first.survey_version))
        add_categories(first, component_weight, result)
        horizons.sort(key=lambda h: h.hzdept_r)
        if any(a.hzdepb_r > b.hzdept_r for a, b in pairwise(horizons)):
            raise ValueError("overlapping horizons or duplicated rows")
        for variable, attribute in PROPERTIES.items():
            present = [
                (h, getattr(h, attribute)) for h in horizons if getattr(h, attribute) is not None
            ]
            depth = sum(max(0, min(h.hzdepb_r, 100) - h.hzdept_r) for h, _ in present)
            # Do not extrapolate an incomplete soil profile to a full metre.
            if abs(depth - 100) > 1e-6:
                continue
            value = sum((min(h.hzdepb_r, 100) - h.hzdept_r) * v for h, v in present) / 100
            sums[variable] += value * component_weight
            weights[variable] += component_weight
    field_area = area_ha(geometry)
    for variable, total in sums.items():
        coverage = weights[variable] / field_area
        if coverage < 0.5:
            continue
        value = total / weights[variable] * (1000 if variable == "awc_mm_per_m" else 1)
        result.soil[variable] = SoilValue(
            value=value, source="ssurgo", confidence=Confidence.medium
        )
    if "om_pct" in result.soil:
        result.soil["soc_pct"] = SoilValue(
            value=result.soil["om_pct"].value / 1.724, source="ssurgo", confidence=Confidence.low
        )
    for destination in (result.hydrologic_groups, result.drainage_classes):
        total = sum(destination.values())
        for key in destination:
            destination[key] /= total
    result.provenance.append(
        {
            "source": "ssurgo",
            "product": "USDA NRCS SSURGO/SDA",
            "survey_versions": sorted(surveys),
            "resolution": "survey map polygons; not a fixed pixel grid",
            "period": "survey versions listed",
            "retrieved": datetime.now(UTC).isoformat(),
            "method": (
                "0-100 cm thickness mean; component percentage x geodesic intersection area; "
                "at least 50% field coverage; OM/1.724 is an approximate SOC conversion"
            ),
            "property_coverage": {k: v / field_area for k, v in weights.items()},
        }
    )
    return result


class DepthRange(BaseModel):
    top_depth: float = Field(ge=0, allow_inf_nan=False)
    bottom_depth: float = Field(gt=0, allow_inf_nan=False)


class DepthValues(BaseModel):
    mean: float | None = Field(ge=0, allow_inf_nan=False)


class GridDepth(BaseModel):
    range: DepthRange
    values: DepthValues


class Units(BaseModel):
    d_factor: float = Field(gt=0, allow_inf_nan=False)


class GridLayer(BaseModel):
    name: str
    unit_measure: Units
    depths: list[GridDepth]


class GridProperties(BaseModel):
    layers: list[GridLayer]


class GridResponse(BaseModel):
    properties: GridProperties


class SoilAdapter:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def fetch(self, geometry: BaseGeometry) -> SoilResult:
        result = SoilResult()
        if US.covers(geometry):
            try:
                response = await self.client.post(
                    SDA, json={"query": query(geometry), "format": "JSON+COLUMNNAME"}, timeout=20
                )
                response.raise_for_status()
                result = aggregate(response.json(), geometry)
            except (httpx.HTTPError, ValueError, TypeError):
                result.gaps.append(
                    Gap(
                        var="soil",
                        reason="SSURGO unavailable or invalid; using SoilGrids where available",
                        severity="warning",
                    )
                )
        missing = {
            "clay_pct",
            "sand_pct",
            "silt_pct",
            "soc_pct",
            "ph",
            "awc_mm_per_m",
        } - result.soil.keys()
        if not missing:
            return result
        if US.covers(geometry) and not result.gaps:
            result.gaps.append(
                Gap(
                    var="soil",
                    reason="SSURGO coverage incomplete; using SoilGrids for missing properties",
                    severity="warning",
                )
            )
        try:
            point = geometry.centroid
            response = await self.client.get(
                SOILGRIDS,
                params=[
                    ("lon", str(point.x)),
                    ("lat", str(point.y)),
                    *(
                        ("property", p)
                        for p in ("clay", "sand", "silt", "soc", "phh2o", "wv0033", "wv1500")
                    ),
                    *(("depth", d) for d in DEPTHS),
                    ("value", "mean"),
                ],
                timeout=15,
            )
            response.raise_for_status()
            layers = GridResponse.model_validate(response.json()).properties.layers
            values: dict[str, float] = {}
            for layer in layers:
                total, thickness = 0.0, 0.0
                for depth in layer.depths:
                    a, b = depth.range.top_depth, min(depth.range.bottom_depth, 100)
                    value = depth.values.mean
                    if value is not None and b > a:
                        total += (b - a) * float(value) / layer.unit_measure.d_factor
                        thickness += b - a
                if thickness == 100:
                    values[layer.name] = total / thickness
            mapped = {
                k: values[v]
                for k, v in {
                    "clay_pct": "clay",
                    "sand_pct": "sand",
                    "silt_pct": "silt",
                    "ph": "phh2o",
                }.items()
                if v in values
            }
            if "soc" in values:
                mapped["soc_pct"] = values["soc"] / 10
            if "wv0033" in values and "wv1500" in values:
                mapped["awc_mm_per_m"] = (values["wv0033"] - values["wv1500"]) * 10
            for key in missing & mapped.keys():
                result.soil[key] = SoilValue(
                    value=mapped[key], source="soilgrids", confidence=Confidence.medium
                )
            result.provenance.append(
                {
                    "source": "soilgrids",
                    "resolution": "250 m centroid grid cell",
                    "period": "SoilGrids 2.0",
                    "method": "thickness-weighted 0-100 cm mean",
                }
            )
        except (httpx.HTTPError, ValueError, KeyError, TypeError, ZeroDivisionError):
            result.gaps.append(
                Gap(
                    var="soil",
                    reason="SoilGrids unavailable; confirm a soil test or regional defaults",
                    severity="warning",
                )
            )
        return result
