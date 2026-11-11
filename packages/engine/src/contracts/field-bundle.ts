// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

/**
 * Field Data Bundle: everything the engine needs to know about one field (TECHNICAL_ARCHITECTURE 5.3).
 */
export interface FieldBundle {
  schema: "field-bundle/1.0";
  field: {
    id: string;
    geometry: FieldGeometry;
    area_ha: number;
    /**
     * [longitude, latitude]
     *
     * @minItems 2
     * @maxItems 2
     */
    centroid: [number, number];
    elevation_m: number;
    slope_mean_deg: number;
  };
  generated_at: string;
  series: CanonicalSeries[];
  /**
   * Per-season Field Memory output.
   */
  phenology: {
    season: number;
    sos?: string;
    peak?: string;
    eos?: string;
    peak_ndvi?: number;
    provenance: Provenance;
  }[];
  layers: {
    zones?: string;
    ndvi_frames?: string;
    nisar?: {
      date: string;
      href: string;
    }[];
  };
  /**
   * Landscape context numbers (GRACE trend, GEDI footprint count, ...).
   */
  context: {
    [k: string]: number | string;
  };
  soil: Soil;
  gaps: {
    var: string;
    reason: string;
    severity: "info" | "warning" | "critical";
  }[];
}
/**
 * GeoJSON Polygon or MultiPolygon in WGS84.
 */
export interface FieldGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown[];
}
/**
 * A time series in the canonical variable vocabulary (TECHNICAL_ARCHITECTURE 5.3).
 */
export interface CanonicalSeries {
  var:
    | "tmax"
    | "tmin"
    | "tmean"
    | "rh"
    | "wind2m"
    | "srad"
    | "precip"
    | "et_actual"
    | "sm_surface"
    | "sm_rootzone"
    | "ndvi"
    | "elevation"
    | "slope";
  unit: string;
  cadence: "daily" | "weekly" | "16-day" | "monthly" | "static";
  start: string;
  /**
   * One value per step; null where the source has no data.
   */
  values: (number | null)[];
  /**
   * Per-step flag, same length as values: 0 good, 1 gap-filled, 2 suspect, 3 missing.
   */
  quality: number[];
  provenance: Provenance;
  /**
   * Where the primary source changes over time (for example final to late IMERG).
   */
  segments: {
    start: string;
    source: string;
  }[];
}
/**
 * Where a number came from (C-2): every series carries one.
 */
export interface Provenance {
  source: string;
  product: string;
  version: string;
  resolution_m: number;
  period: Period;
  quality: "high" | "medium" | "low";
  /**
   * Source ids this value was derived from; empty for raw observations.
   */
  derived_from: string[];
  method?: string;
  retrieved?: string;
}
export interface Period {
  start: string;
  end: string;
}
/**
 * Soil properties; every value carries a source (F-05).
 */
export interface Soil {
  clay_pct?: SoilValue;
  sand_pct?: SoilValue;
  silt_pct?: SoilValue;
  organic_carbon_pct?: SoilValue;
  ph?: SoilValue;
  awc_mm_per_m?: SoilValue;
  depth_cm?: SoilValue;
}
/**
 * A soil property with its source and confidence (C-2).
 */
export interface SoilValue {
  value: number;
  source: string;
  confidence: "high" | "medium" | "low";
}
