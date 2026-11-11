// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

/**
 * Input and output of the browser-side assistant tools (TECHNICAL_ARCHITECTURE 10.3). Gateway-side MCP tools are defined by their servers.
 */
export type AssistantToolMessage = ToolCall | ToolResult;
export type ToolCall =
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
export type RotationIds = string[];
export type ToolResult =
  | GetFieldSummaryResult
  | CompareRotationsResult
  | RunBacktestResult
  | GetSeasonResult
  | ExplainExclusionResult
  | SetPrioritiesResult
  | SetConstraintsResult
  | RenderAnswerResult
  | NavigateResult
  | DefineTermResult;

export interface GetFieldSummaryCall {
  tool: "get_field_summary";
  input: Empty;
}
export interface Empty {}
export interface CompareRotationsCall {
  tool: "compare_rotations";
  input: {
    ids?: RotationIds;
  };
}
export interface RunBacktestCall {
  tool: "run_backtest";
  input: {
    rotation: string;
    scenario?: Scenario;
  };
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
export interface GetSeasonCall {
  tool: "get_season";
  input: {
    year: number;
  };
}
export interface ExplainExclusionCall {
  tool: "explain_exclusion";
  input: {
    crop: string;
  };
}
export interface SetPrioritiesCall {
  tool: "set_priorities";
  input: Priorities;
}
/**
 * Seven sliders, 0 to 5 (F-05). The engine normalizes them into criterion weights.
 */
export interface Priorities {
  save_water: number;
  soil_health: number;
  nitrogen: number;
  erosion_control: number;
  forage: number;
  income: number;
  pest_break: number;
}
export interface SetConstraintsCall {
  tool: "set_constraints";
  input: Constraints;
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
export interface RenderAnswerCall {
  tool: "render_answer";
  input: {
    /**
     * A2UI messages; validated against the ui-kit catalog at the gateway.
     *
     * @minItems 1
     */
    messages: [{}, ...{}[]];
  };
}
export interface NavigateCall {
  tool: "navigate";
  input: {
    view: "map" | "replay" | "cards" | "future_2050" | "twin_3d" | "zones";
    params?: {
      [k: string]: number | string | boolean;
    };
  };
}
export interface DefineTermCall {
  tool: "define_term";
  input: {
    term: string;
  };
}
export interface GetFieldSummaryResult {
  tool: "get_field_summary";
  output: {
    area_ha: number;
    history_years: number[];
    climate_highlights: Fact[];
  };
}
/**
 * A number with provenance.
 */
export interface Fact {
  label: string;
  value: number | string;
  source: string;
  resolution: string;
  period: string;
}
export interface CompareRotationsResult {
  tool: "compare_rotations";
  output: {
    cards: EvidenceCard[];
  };
}
/**
 * Evidence card for one rotation (F-08). Every mandatory field must be present.
 */
export interface EvidenceCard {
  schema: "evidence-card/1.0";
  rotation_id: string;
  why: string;
  /**
   * @minItems 1
   */
  evidence: [EvidenceItem, ...EvidenceItem[]];
  benefits: string[];
  gaps: string[];
  /**
   * Risks needing local review.
   */
  risks: string[];
  score: number;
  resilience_headline: string;
  confidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };
  contributions: CriterionValues;
}
export interface EvidenceItem {
  indicator: string;
  value: number | string;
  comparison: string;
  source: string;
  resolution: string;
  period: string;
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
export interface RunBacktestResult {
  tool: "run_backtest";
  output: RotationResult;
}
export interface RotationResult {
  rotation_id: string;
  seasons: SeasonResult[];
  composite: number;
  contributions: CriterionValues;
  resilience: ResilienceProfile;
}
export interface SeasonResult {
  year: number;
  criteria: CriterionValues;
  composite: number;
  composite_band: Band;
  wsi: number;
  severe_water_stress: boolean;
  frost_hits: number;
  heat_hits: number;
}
export interface Band {
  p10: number;
  p50: number;
  p90: number;
}
export interface ResilienceProfile {
  median: number;
  p10: number;
  p90: number;
  worst: number;
  worst_year: number;
  severe_water_stress_seasons: number;
  frost_heat_hits: number;
  win_rate: number;
}
export interface GetSeasonResult {
  tool: "get_season";
  output: {
    year: number;
    indicators: Fact[];
    results: RotationResult[];
  };
}
export interface ExplainExclusionResult {
  tool: "explain_exclusion";
  output: {
    crop: string;
    excluded: boolean;
    reason: string;
    filter: string;
  };
}
export interface SetPrioritiesResult {
  tool: "set_priorities";
  output: StateChange;
}
/**
 * Applied only after the user confirms a ConfirmForm.
 */
export interface StateChange {
  applied: boolean;
}
export interface SetConstraintsResult {
  tool: "set_constraints";
  output: StateChange;
}
export interface RenderAnswerResult {
  tool: "render_answer";
  output: {
    rendered: boolean;
  };
}
export interface NavigateResult {
  tool: "navigate";
  output: {
    navigated: boolean;
  };
}
export interface DefineTermResult {
  tool: "define_term";
  output: {
    term: string;
    definition: string;
  };
}
