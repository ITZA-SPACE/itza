import { type FallbackOptions, fallbackSurface, type IntentClass } from "@itza/ui-kit/catalog";

/**
 * The scripted demo questions, one per answer layout, with what a recorded session contains: the
 * browser tool the model called, the result the browser sent back, and the answer the model built
 * from it. Tool results have the shape of `apps/web/src/assistant/tools.ts` (`output` of each tool).
 * The provider is replaced by this recording, so the evaluation needs no network and no key.
 */
export interface EvalCase {
  id: string;
  question: string;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  intent: IntentClass;
  options?: FallbackOptions;
  /** The caption the recorded model wrote; every number in it must come from `output`. */
  caption: string;
}

const rotations = {
  label: "model-based counterfactual, not measured yield",
  baseline_id: "r1",
  rotations: [
    {
      id: "r1",
      name: "Durum wheat, Fallow",
      is_baseline: true,
      score: 0.58,
      headline: "Held up in 17 of 25 seasons",
      confidence: "medium",
      p10: 0.41,
      worst: 0.33,
      severe_water_stress_seasons: 4,
    },
    {
      id: "r2",
      name: "Durum wheat, Chickpea",
      is_baseline: false,
      score: 0.66,
      headline: "Held up in 21 of 25 seasons",
      confidence: "medium",
      p10: 0.52,
      worst: 0.45,
      severe_water_stress_seasons: 2,
    },
  ],
};

const backtest = {
  found: true,
  id: "r2",
  name: "Durum wheat, Chickpea",
  scenario: "history",
  score: 0.66,
  median: 0.66,
  p10: 0.52,
  p90: 0.78,
  worst: 0.45,
  severe_water_stress_seasons: 2,
  frost_heat_hits: 3,
  win_rate: 0.84,
  hardest_season: "2012-13",
};

const summary = {
  area_ha: 12.4,
  latitude: 36.12,
  longitude: 5.33,
  seasons_replayed: 25,
  hardest_season: "2012-13",
  current_rotation: "Durum wheat, Fallow",
  rotations_compared: 5,
  season_scores: [
    { season: "2012-13", mean_score: 0.49 },
    { season: "2015-16", mean_score: 0.71 },
    { season: "2019-20", mean_score: 0.62 },
  ],
};

export const EVAL_CASES: EvalCase[] = [
  {
    id: "compare_rotations",
    question: "Which rotation held up best?",
    tool: "compare_rotations",
    input: {},
    output: rotations,
    intent: "compare_rotations",
    caption:
      "Durum wheat, Chickpea ranks first with a score of 0.66. Your current rotation, Durum wheat, Fallow, scores 0.58.",
  },
  {
    id: "season_replay",
    question: "Replay the best rotation on past seasons",
    tool: "run_backtest",
    input: { rotation: "r2" },
    output: backtest,
    intent: "season_replay",
    caption:
      "Durum wheat, Chickpea scored 0.66 in a typical season and 0.45 in its hardest, 2012-13, with 2 seasons of severe water stress.",
  },
  {
    id: "season_snapshot",
    question: "Show me the hardest season",
    tool: "get_season",
    input: { year: 2012 },
    output: {
      found: true,
      season: "2012-13",
      is_hardest: true,
      rain_mm: 231,
      peak_ndvi: 0.48,
      scores: [],
    },
    intent: "season_snapshot",
    options: { year: 2012 },
    caption:
      "In season 2012-13, 231 mm of rain fell and the crop's greenness peaked at 0.48 (NDVI).",
  },
  {
    id: "future_2050",
    question: "How would the best rotation do in 2050?",
    tool: "run_backtest",
    input: { rotation: "r2", scenario: "2050" },
    output: {
      ...backtest,
      scenario: "2050",
      ssp: "ssp245",
      score_change: -0.07,
      score_change_min: -0.12,
      score_change_max: -0.02,
    },
    intent: "future_2050",
    options: { rotation: "r2" },
    caption:
      "On SSP2-4.5, the score of Durum wheat, Chickpea changes by -0.07 around 2050, somewhere between -0.12 and -0.02.",
  },
  {
    id: "explain_evidence",
    question: "Why is the top rotation ranked first?",
    tool: "compare_rotations",
    input: {},
    output: rotations,
    intent: "explain_evidence",
    caption: "Durum wheat, Chickpea leads the comparison. It held up in 21 of 25 seasons.",
  },
  {
    id: "climate_context",
    question: "Which seasons were hardest for this field?",
    tool: "get_field_summary",
    input: {},
    output: summary,
    intent: "climate_context",
    caption:
      "Over 25 replayed seasons, the hardest was 2012-13. Average rotation scores ranged from 0.49 to 0.71.",
  },
  {
    id: "map_layer",
    question: "Show the NDVI layer on the map",
    tool: "get_field_summary",
    input: {},
    output: summary,
    intent: "map_layer",
    options: { layer: "ndvi" },
    caption: "The map now shows the greenness (NDVI) layer for your field.",
  },
  {
    id: "confirm_settings",
    question: "I keep sheep and have little water",
    tool: "set_constraints",
    input: { constraints: { irrigation: "none", livestock: "yes" } },
    output: { status: "pending_confirmation" },
    intent: "confirm_settings",
    options: { kind: "constraints" },
    caption: "Here is what I understood. Check it and press Confirm to apply it.",
  },
  {
    id: "define_term",
    question: "What is NDVI?",
    tool: "define_term",
    input: { term: "NDVI" },
    output: {
      found: true,
      term: "Vegetation greenness (e.g., NDVI)",
      definition: "A satellite score from 0 to 1; higher means more living plants.",
    },
    intent: "define_term",
    caption:
      "Vegetation greenness (e.g., NDVI): A satellite score from 0 to 1; higher means more living plants.",
  },
  {
    id: "general",
    question: "What can you help me with?",
    tool: "get_field_summary",
    input: {},
    output: summary,
    intent: "general",
    caption: "I can compare rotations, replay past seasons and explain the results for your field.",
  },
];

/** The answer the recorded model builds: the predefined layout of the intent with its caption. */
export const surfaceOf = (c: EvalCase) => fallbackSurface(c.intent, c.caption, c.options);
