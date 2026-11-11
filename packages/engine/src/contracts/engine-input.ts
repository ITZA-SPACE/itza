// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

export type PriorityWeight = number;

/**
 * Everything the simulation engine needs besides the Field Data Bundle.
 */
export interface EngineInput {
  schema: "engine-input/1.0";
  /**
   * @minItems 1
   */
  rotations: [Rotation, ...Rotation[]];
  baseline_id: string;
  soil: Soil;
  priorities: Priorities;
  constraints: Constraints;
  scenario: Scenario;
  seed: number;
  monte_carlo_draws?: number;
}
/**
 * Ordered seasons, each a crop id from the region pack, or 'fallow' or 'cover'.
 */
export interface Rotation {
  id: string;
  name?: string;
  /**
   * @minItems 1
   */
  seasons: [string, ...string[]];
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
/**
 * Seven sliders, 0 to 5 (F-05). The engine normalizes them into criterion weights.
 */
export interface Priorities {
  save_water: PriorityWeight;
  soil_health: PriorityWeight;
  nitrogen: PriorityWeight;
  erosion_control: PriorityWeight;
  forage: PriorityWeight;
  income: PriorityWeight;
  pest_break: PriorityWeight;
}
/**
 * Hard filters (F-05).
 */
export interface Constraints {
  irrigation: {
    mode: "none" | "supplemental" | "full";
    cap_mm?: number;
  };
  equipment_limits: string[];
  livestock: boolean;
  /**
   * Crop id to whether the farmer can sell it.
   */
  market_access: {
    [k: string]: boolean;
  };
  exclude_crops: string[];
}
/**
 * Delta-change applied to the observed series. Empty object means history as observed.
 */
export interface Scenario {
  delta_rain_pct?: number;
  delta_temp_c?: number;
  future_2050?: {
    ssp: "ssp126" | "ssp245" | "ssp370";
    model: string;
    /**
     * Additive change per month, January first.
     *
     * @minItems 12
     * @maxItems 12
     */
    temp_delta_c: [number, number, number, number, number, number, number, number, number, number, number, number];
    /**
     * Multiplicative change per month, January first.
     *
     * @minItems 12
     * @maxItems 12
     */
    precip_factor: [number, number, number, number, number, number, number, number, number, number, number, number];
  };
}
