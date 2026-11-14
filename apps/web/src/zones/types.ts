export interface ZoneSource {
  source: string;
  product?: string;
  resolution_m?: number;
  period?: { start: string; end: string } | null;
}

export interface SoilScenario {
  awc_mm_per_m: number;
  curve_number: number;
  label: string;
}

export interface ZoneProperties {
  zone: number;
  area_ha: number;
  pixels: number;
  ndvi_mean: number;
  slope_deg: number | null;
  stability: number | null;
  notes: string[];
  soil_water: SoilScenario | null;
}

export interface ZoneFeature {
  type: "Feature";
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: ZoneProperties;
}

/** The part of the `/v1/zones` response the app uses. */
export interface ZoneCollection {
  type: "FeatureCollection";
  enabled: boolean;
  reason: string | null;
  features: ZoneFeature[];
  k: number | null;
  stability: number | null;
  years: number[];
  coverage: number;
  provenance: ZoneSource[];
}
