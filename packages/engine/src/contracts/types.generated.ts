/* Generated from schemas/*.schema.json by scripts/schemas.mjs. Do not edit. */

/**
 * @minItems 4
 *
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "LinearRing".
 */
export type LinearRing = [Position, Position, Position, Position, ...Position[]];
/**
 * [longitude, latitude]
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "Position".
 */
export type Position = [number, number];
/**
 * Input and output of the assistant tools (TECHNICAL_ARCHITECTURE 10.3). The root validates a tool call; each tool's output is under $defs.
 */
export type AssistantToolCall =
  | GetFieldSummaryCall
  | CompareRotationsCall
  | RunBacktestCall
  | GetSeasonCall
  | ExplainExclusionCall
  | SetPrioritiesCall
  | SetConstraintsCall
  | RenderAnswerCall
  | NavigateCall
  | DefineTermCall;

export interface Contracts {
  provenance: Provenance;
  "canonical-series": CanonicalSeries;
  "field-bundle": FieldBundle;
  "engine-input": EngineInput;
  "engine-output": EngineOutput;
  "evidence-card": EvidenceCard;
  "assistant-tools": AssistantToolCall;
}
/**
 * Where a value comes from (C-2). Every series and evidence item carries one.
 */
export interface Provenance {
  /**
   * Adapter or dataset id, e.g. gpm_imerg_final_daily.
   */
  source: string;
  /**
   * Data product name, e.g. GPM IMERG Final Daily.
   */
  product: string;
  version: string;
  /**
   * Native spatial resolution in meters; 0 for point data.
   */
  resolution_m: number;
  period: {
    start: string;
    end: string;
  };
  quality?: {
    /**
     * Share of steps with primary-source data.
     */
    coverage: number;
    flags?: string[];
  };
  /**
   * Sources this value was computed from.
   */
  derived_from?: string[];
  /**
   * e.g. area_weighted, nearest_cell.
   */
  method?: string;
  retrieved?: string;
}
/**
 * One time series of a canonical variable, with mandatory provenance.
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
  cadence: "daily" | "8-day" | "monthly";
  start: string;
  /**
   * null marks a missing step.
   */
  values: (number | null)[];
  /**
   * Per-step flags, 0 = good.
   */
  quality?: number[];
  provenance: Provenance;
  /**
   * Source changes along the series (e.g. IMERG Final to Late).
   */
  segments?: {
    start: string;
    source: string;
  }[];
}
/**
 * Field Data Bundle: the core contract between data services and the engine (TECHNICAL_ARCHITECTURE 5.3).
 */
export interface FieldBundle {
  schema: "field-bundle/1.0";
  /**
   * True for hand-made test fixtures; never set on real data.
   */
  synthetic?: boolean;
  field: {
    /**
     * sha256 of the geometry rounded to 5 decimals.
     */
    id: string;
    geometry: Polygon | MultiPolygon;
    area_ha: number;
    centroid: Position;
    elevation_m?: number;
    slope_mean_deg?: number;
  };
  generated_at: string;
  series: CanonicalSeries[];
  /**
   * Per-season Field Memory output.
   */
  phenology: SeasonPhenology[];
  layers?: {
    zones?: string;
    ndvi_frames?: string;
    nisar?: {
      date: string;
      href: string;
    }[];
  };
  context?: {
    grace_tws_trend_cm_per_yr?: number;
    gedi_footprints?: number;
  };
  /**
   * Soil properties by name (clay_pct, organic_carbon_pct, ph, ...), each with source and confidence.
   */
  soil: {
    [k: string]: SoilProperty;
  };
  gaps: BundleGap[];
}
/**
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "Polygon".
 */
export interface Polygon {
  type: "Polygon";
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "MultiPolygon".
 */
export interface MultiPolygon {
  type: "MultiPolygon";
  /**
   * @minItems 1
   */
  coordinates: [[LinearRing, ...LinearRing[]], ...[LinearRing, ...LinearRing[]][]];
}
/**
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "SeasonPhenology".
 */
export interface SeasonPhenology {
  /**
   * Agricultural year, e.g. 2022/23.
   */
  season: string;
  label: "winter_crop" | "summer_crop" | "fallow" | "uncertain";
  label_confidence: "low" | "medium" | "high";
  green_up?: string;
  peak?: string;
  senescence?: string;
  peak_ndvi?: number;
}
/**
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "SoilProperty".
 */
export interface SoilProperty {
  value: number;
  source: string;
  confidence: "low" | "medium" | "high";
}
/**
 * This interface was referenced by `FieldBundle`'s JSON-Schema
 * via the `definition` "BundleGap".
 */
export interface BundleGap {
  var: string;
  reason: string;
  severity: "info" | "warning" | "error";
}
/**
 * Everything the engine needs besides the field bundle (TECHNICAL_ARCHITECTURE 6).
 */
export interface EngineInput {
  rotation: Rotation;
  soil: SoilInput;
  priorities: Priorities;
  constraints: Constraints;
  /**
   * Sliders (rain and temperature deltas) or 2050 monthly delta-change factors.
   *
   * This interface was referenced by `EngineInput`'s JSON-Schema
   * via the `definition` "Scenario".
   */
  scenario:
    | {
        kind: "sliders";
        delta_precip_pct: number;
        delta_temp_c: number;
      }
    | {
        kind: "delta_change";
        ssp: "ssp126" | "ssp245" | "ssp370" | "ssp585";
        /**
         * Additive temperature change per month (Jan to Dec).
         *
         * @minItems 12
         * @maxItems 12
         */
        temp_add_c: [number, number, number, number, number, number, number, number, number, number, number, number];
        /**
         * Multiplicative precipitation factor per month (Jan to Dec).
         *
         * @minItems 12
         * @maxItems 12
         */
        precip_mult: [number, number, number, number, number, number, number, number, number, number, number, number];
      };
  /**
   * Seed for the Monte Carlo PRNG.
   */
  seed: number;
}
/**
 * This interface was referenced by `EngineInput`'s JSON-Schema
 * via the `definition` "Rotation".
 */
export interface Rotation {
  id: string;
  name?: string;
  /**
   * Ordered seasons; crop ids from the knowledge pack, plus the reserved ids fallow and cover.
   *
   * @minItems 1
   */
  seasons: [
    {
      slot: "winter" | "summer";
      crop: string;
    },
    ...{
      slot: "winter" | "summer";
      crop: string;
    }[]
  ];
}
/**
 * This interface was referenced by `EngineInput`'s JSON-Schema
 * via the `definition` "SoilInput".
 */
export interface SoilInput {
  clay_pct: number;
  sand_pct: number;
  organic_carbon_pct: number;
  ph: number;
  /**
   * Available water capacity per meter of soil.
   */
  awc_mm_per_m: number;
  depth_cm: number;
}
/**
 * Priority sliders, 0 to 5; normalized into criterion weights by the engine.
 *
 * This interface was referenced by `EngineInput`'s JSON-Schema
 * via the `definition` "Priorities".
 */
export interface Priorities {
  save_water: number;
  soil_health: number;
  nitrogen: number;
  erosion_control: number;
  forage: number;
  income_market: number;
  pest_break: number;
}
/**
 * Hard filters applied before scoring.
 *
 * This interface was referenced by `EngineInput`'s JSON-Schema
 * via the `definition` "Constraints".
 */
export interface Constraints {
  irrigation: {
    availability: "none" | "supplemental" | "full";
    cap_mm?: number;
  };
  equipment_limits?: string[];
  livestock: boolean;
  /**
   * Market access per crop id.
   */
  market_access?: {
    [k: string]: boolean;
  };
  excluded_crops: string[];
}
/**
 * Per rotation and season criterion scores, composite, resilience profile, contributions and Monte Carlo bands (TECHNICAL_ARCHITECTURE 6.3, 6.4).
 */
export interface EngineOutput {
  seed: number;
  baseline_rotation_id: string;
  rotations: RotationResult[];
}
/**
 * This interface was referenced by `EngineOutput`'s JSON-Schema
 * via the `definition` "RotationResult".
 */
export interface RotationResult {
  rotation_id: string;
  seasons: SeasonResult[];
  resilience: ResilienceProfile;
}
/**
 * This interface was referenced by `EngineOutput`'s JSON-Schema
 * via the `definition` "SeasonResult".
 */
export interface SeasonResult {
  year: number;
  criteria: CriterionValues;
  composite: number;
  contributions: CriterionValues1;
  band: Band;
}
/**
 * One value per scoring criterion; used for scores and for contributions.
 *
 * This interface was referenced by `EngineOutput`'s JSON-Schema
 * via the `definition` "CriterionValues".
 */
export interface CriterionValues {
  climate_fit: number;
  water_balance: number;
  soil_nitrogen: number;
  organic_matter: number;
  erosion_control: number;
  bare_field_exposure: number;
  /**
   * Already inverted: 1 means no pressure.
   */
  pest_pressure: number;
  forage_income: number;
}
/**
 * One value per scoring criterion; used for scores and for contributions.
 */
export interface CriterionValues1 {
  climate_fit: number;
  water_balance: number;
  soil_nitrogen: number;
  organic_matter: number;
  erosion_control: number;
  bare_field_exposure: number;
  /**
   * Already inverted: 1 means no pressure.
   */
  pest_pressure: number;
  forage_income: number;
}
/**
 * Monte Carlo band on the composite.
 */
export interface Band {
  p10: number;
  p50: number;
  p90: number;
}
/**
 * This interface was referenced by `EngineOutput`'s JSON-Schema
 * via the `definition` "ResilienceProfile".
 */
export interface ResilienceProfile {
  median: number;
  p10: number;
  p90: number;
  worst: number;
  severe_water_stress_seasons: number;
  frost_heat_hits: number;
  /**
   * Share of seasons where the rotation beats the baseline.
   */
  win_rate: number;
}
/**
 * Evidence card (F-08). Every mandatory field must be present and every evidence item must name its source.
 */
export interface EvidenceCard {
  rotation_id: string;
  is_baseline?: boolean;
  /**
   * Why this rotation is suggested.
   *
   * @minItems 1
   */
  why: [string, ...string[]];
  /**
   * @minItems 1
   */
  evidence: [EvidenceItem, ...EvidenceItem[]];
  benefits: string[];
  /**
   * Information gaps.
   *
   * @minItems 1
   */
  gaps: [string, ...string[]];
  /**
   * Risks needing local review.
   *
   * @minItems 1
   */
  risks: [string, ...string[]];
  score: number;
  resilience_headline: string;
  confidence: {
    level: "high" | "medium" | "low";
    /**
     * @minItems 1
     */
    reasons: [string, ...string[]];
  };
  contributions: CriterionValues2;
}
/**
 * This interface was referenced by `EvidenceCard`'s JSON-Schema
 * via the `definition` "EvidenceItem".
 */
export interface EvidenceItem {
  indicator: string;
  value: number | string;
  comparison: string;
  source: string;
  resolution: string;
  period: string;
}
/**
 * One value per scoring criterion; used for scores and for contributions.
 */
export interface CriterionValues2 {
  climate_fit: number;
  water_balance: number;
  soil_nitrogen: number;
  organic_matter: number;
  erosion_control: number;
  bare_field_exposure: number;
  /**
   * Already inverted: 1 means no pressure.
   */
  pest_pressure: number;
  forage_income: number;
}
export interface GetFieldSummaryCall {
  tool: "get_field_summary";
  input: GetFieldSummaryInput;
}
export interface GetFieldSummaryInput {}
export interface CompareRotationsCall {
  tool: "compare_rotations";
  input: CompareRotationsInput;
}
export interface CompareRotationsInput {
  rotation_ids?: string[];
}
export interface RunBacktestCall {
  tool: "run_backtest";
  input: RunBacktestInput;
}
export interface RunBacktestInput {
  rotation_id: string;
  /**
   * Sliders (rain and temperature deltas) or 2050 monthly delta-change factors.
   *
   * This interface was referenced by `EngineInput`'s JSON-Schema
   * via the `definition` "Scenario".
   */
  scenario?:
    | {
        kind: "sliders";
        delta_precip_pct: number;
        delta_temp_c: number;
      }
    | {
        kind: "delta_change";
        ssp: "ssp126" | "ssp245" | "ssp370" | "ssp585";
        /**
         * Additive temperature change per month (Jan to Dec).
         *
         * @minItems 12
         * @maxItems 12
         */
        temp_add_c: [number, number, number, number, number, number, number, number, number, number, number, number];
        /**
         * Multiplicative precipitation factor per month (Jan to Dec).
         *
         * @minItems 12
         * @maxItems 12
         */
        precip_mult: [number, number, number, number, number, number, number, number, number, number, number, number];
      };
}
export interface GetSeasonCall {
  tool: "get_season";
  input: GetSeasonInput;
}
export interface GetSeasonInput {
  year: number;
}
export interface ExplainExclusionCall {
  tool: "explain_exclusion";
  input: ExplainExclusionInput;
}
export interface ExplainExclusionInput {
  crop: string;
}
export interface SetPrioritiesCall {
  tool: "set_priorities";
  input: SetPrioritiesInput;
}
export interface SetPrioritiesInput {
  priorities: Priorities;
}
export interface SetConstraintsCall {
  tool: "set_constraints";
  input: SetConstraintsInput;
}
export interface SetConstraintsInput {
  constraints: Constraints;
}
export interface RenderAnswerCall {
  tool: "render_answer";
  input: RenderAnswerInput;
}
export interface RenderAnswerInput {
  /**
   * @minItems 1
   *
   * Items: A2UI message (createSurface, updateComponents, updateDataModel); validated against the catalog schema separately.
   */
  messages: [{}, ...{}[]];
}
export interface NavigateCall {
  tool: "navigate";
  input: NavigateInput;
}
export interface NavigateInput {
  view: "map" | "replay" | "compare" | "future" | "twin" | "zones" | "methods";
  params?: {
    [k: string]: string | number | boolean;
  };
}
export interface DefineTermCall {
  tool: "define_term";
  input: DefineTermInput;
}
export interface DefineTermInput {
  term: string;
}
