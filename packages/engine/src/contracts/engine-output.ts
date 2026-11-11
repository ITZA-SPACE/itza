// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

export type Unit = number;

/**
 * Replay results per rotation and season, with resilience profile and Monte Carlo bands.
 */
export interface EngineOutput {
  schema: "engine-output/1.0";
  seed: number;
  baseline_id: string;
  results: RotationResult[];
}
export interface RotationResult {
  rotation_id: string;
  seasons: SeasonResult[];
  composite: Unit;
  contributions: CriterionValues;
  resilience: ResilienceProfile;
}
export interface SeasonResult {
  year: number;
  criteria: CriterionValues;
  composite: Unit;
  composite_band: Band;
  wsi: Unit;
  severe_water_stress: boolean;
  frost_hits: number;
  heat_hits: number;
}
/**
 * One number per criterion.
 */
export interface CriterionValues {
  climate_fit: number;
  water_balance: number;
  soil_nitrogen: number;
  organic_matter: number;
  erosion_control: number;
  bare_field_exposure: number;
  pest_pressure: number;
  forage_income: number;
}
export interface Band {
  p10: number;
  p50: number;
  p90: number;
}
export interface ResilienceProfile {
  median: Unit;
  p10: Unit;
  p90: Unit;
  worst: Unit;
  worst_year: number;
  severe_water_stress_seasons: number;
  frost_heat_hits: number;
  win_rate: Unit;
}
