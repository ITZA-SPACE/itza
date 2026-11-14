/**
 * JSON Schema (draft 2020-12) of a knowledge pack, version `knowledge-pack/1.0`.
 * Build tooling only: the app imports the generated, already validated packs.
 * Every numeric value is `{ value, source, confidence }`; `source` must name an entry in the
 * pack's `sources` (checked in `validate.ts`).
 */
export const SCHEMA_VERSION = "knowledge-pack/1.0";
export const SCHEMA_ID = "https://itza.dev/schemas/knowledge-pack.schema.json";

type Schema = Record<string, unknown>;

const CONFIDENCE = { enum: ["high", "medium", "low"] };
const ID = { type: "string", pattern: "^[a-z][a-z0-9_]{1,40}$" };
const PACK_ID = { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" };
const DATE = { type: "string", pattern: "^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" };
const FAMILIES = [
  "poaceae",
  "fabaceae",
  "brassicaceae",
  "asteraceae",
  "solanaceae",
  "mixed",
  "none",
];
const STAGES = ["ini", "dev", "mid", "late"];

/** A number with its citation and confidence. */
function num(min: number, max: number, description: string, integer = false): Schema {
  return {
    type: "object",
    description,
    properties: {
      value: { type: integer ? "integer" : "number", minimum: min, maximum: max },
      source: ID,
      confidence: CONFIDENCE,
      note: { type: "string", maxLength: 240 },
    },
    required: ["value", "source", "confidence"],
    additionalProperties: false,
  };
}

function byStage(min: number, max: number, description: string, integer = false): Schema {
  return {
    type: "object",
    description: `${description} Keys are the four FAO-56 stages: initial, development, mid, late.`,
    properties: Object.fromEntries(STAGES.map((s) => [s, num(min, max, description, integer)])),
    required: STAGES,
    additionalProperties: false,
  };
}

const dateWindow: Schema = {
  type: "object",
  description: "Calendar window as MM-DD; it may wrap over the year end.",
  properties: {
    start: DATE,
    end: DATE,
    source: ID,
    confidence: CONFIDENCE,
    note: { type: "string", maxLength: 240 },
  },
  required: ["start", "end", "source", "confidence"],
  additionalProperties: false,
};

const flag: Schema = {
  type: "object",
  properties: {
    value: { type: "boolean" },
    source: ID,
    confidence: CONFIDENCE,
    note: { type: "string", maxLength: 240 },
  },
  required: ["value", "source", "confidence"],
  additionalProperties: false,
};

const name = { type: "string", minLength: 1, maxLength: 80 };
const family = { enum: FAMILIES };

/**
 * Advisory evidence only. This is the v5 all-land suitability class, not a yield or
 * a field measurement. Missing crop mappings must not become unsuitable ratings.
 */
const gaezSuitability: Schema = {
  type: "object",
  properties: {
    status: { enum: ["available", "not_available"] },
    value: { oneOf: [{ type: "integer", minimum: 1, maximum: 8 }, { type: "null" }] },
    source: ID,
    confidence: CONFIDENCE,
    version: { const: "GAEZ v5" },
    layer: { const: "RES05-SIX30AS" },
    water_supply: { const: "rainfed" },
    input_level: { enum: ["low", "high"] },
    climate: { const: "AgERA5" },
    period: { enum: ["1981-2000", "2001-2020"] },
    resolution_arc_seconds: { const: 30 },
    location: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
        latitude: { type: "number", minimum: -90, maximum: 90 },
      },
      required: ["name", "longitude", "latitude"],
      additionalProperties: false,
    },
    accessed: { type: "string", format: "date" },
    gaez_crop: { type: "string", pattern: "^[A-Z]{3,5}$" },
    raster_url: { type: "string", format: "uri" },
    note: { type: "string", minLength: 1, maxLength: 600 },
    usage: { const: "evidence_only" },
  },
  required: [
    "status",
    "value",
    "source",
    "confidence",
    "version",
    "layer",
    "water_supply",
    "input_level",
    "climate",
    "period",
    "resolution_arc_seconds",
    "location",
    "accessed",
    "note",
    "usage",
  ],
  additionalProperties: false,
};

/** Properties every entry of `crops` has, fallow included. */
const commonCrop = {
  id: ID,
  name,
  n_credit_kg_ha: num(
    -100,
    200,
    "Net nitrogen left for the next crop in kg N/ha; negative for crops that draw soil nitrogen down.",
  ),
  residue_root_index: num(0, 1, "Relative residue and root biomass returned to the soil, 0 to 1."),
  cover_months: num(0, 12, "Months of the agricultural year with living or residue ground cover."),
  forage_value: num(0, 1, "Relative value as forage or fodder, 0 to 1."),
  market_flag: flag,
} as const;

const crop: Schema = {
  type: "object",
  description: "A crop, or a cover crop that is terminated before grain.",
  properties: {
    ...commonCrop,
    gaez_suitability: gaezSuitability,
    kind: { enum: ["crop", "cover"] },
    family,
    requires_irrigation: { type: "boolean" },
    kc_ini: num(0, 1.5, "FAO-56 single crop coefficient, initial stage."),
    kc_mid: num(0, 1.5, "FAO-56 single crop coefficient, mid stage."),
    kc_end: num(0, 1.5, "FAO-56 single crop coefficient, end of late stage."),
    stage_days: byStage(1, 400, "Length of the stage in days.", true),
    season_length_days: num(
      20,
      400,
      "Sowing to end of late stage; equals the sum of stage_days.",
      true,
    ),
    root_depth_ini_m: num(0.05, 1, "Rooting depth at emergence in metres."),
    root_depth_max_m: num(0.1, 3, "Maximum effective rooting depth in metres."),
    depletion_fraction: num(
      0.1,
      0.8,
      "FAO-56 fraction p of total available water usable without stress.",
    ),
    t_base_c: num(-5, 15, "Base temperature for development in degrees C."),
    t_opt_c: num(10, 35, "Optimal temperature in degrees C."),
    t_max_c: num(25, 50, "Upper temperature limit in degrees C."),
    frost_threshold_c: byStage(
      -30,
      10,
      "Daily minimum temperature at or below which frost damage starts.",
    ),
    heat_threshold_c: byStage(
      20,
      50,
      "Daily maximum temperature at or above which heat damage starts.",
    ),
    sowing_window: dateWindow,
  },
  required: [
    ...Object.keys(commonCrop),
    "kind",
    "family",
    "requires_irrigation",
    "kc_ini",
    "kc_mid",
    "kc_end",
    "stage_days",
    "season_length_days",
    "root_depth_ini_m",
    "root_depth_max_m",
    "depletion_fraction",
    "t_base_c",
    "t_opt_c",
    "t_max_c",
    "frost_threshold_c",
    "heat_threshold_c",
    "sowing_window",
  ],
  additionalProperties: false,
};

const fallow: Schema = {
  type: "object",
  description: "Bare or weedy fallow: no crop coefficients, only what it leaves behind.",
  properties: { ...commonCrop, gaez_suitability: gaezSuitability, kind: { const: "fallow" } },
  required: [...Object.keys(commonCrop), "kind"],
  additionalProperties: false,
};

const pest: Schema = {
  type: "object",
  description: "A pathogen or pest that carries over between seasons on host crops.",
  properties: {
    id: ID,
    name,
    type: { enum: ["fungal", "insect", "bacterial", "nematode", "parasitic_weed"] },
    hosts: {
      type: "object",
      properties: {
        families: { type: "array", items: family, uniqueItems: true },
        crops: { type: "array", items: ID, uniqueItems: true },
      },
      required: ["families", "crops"],
      additionalProperties: false,
    },
    weather_driver: {
      enum: ["wet", "warm_dry", "none"],
      description:
        "Weather that raises risk: wet spells (fungal), warm dry spells (insects), or none.",
    },
    soil_persistence_years: num(
      0,
      30,
      "Years the pest survives in soil or residue without a host.",
    ),
    min_break_years: num(0, 30, "Minimum years between host crops to keep pressure low."),
  },
  required: [
    "id",
    "name",
    "type",
    "hosts",
    "weather_driver",
    "soil_persistence_years",
    "min_break_years",
  ],
  additionalProperties: false,
};

export const PACK_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: SCHEMA_ID,
  title: "KnowledgePack",
  "x-version": SCHEMA_VERSION,
  type: "object",
  properties: {
    schema: { const: SCHEMA_VERSION },
    id: PACK_ID,
    name,
    version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    generic: {
      type: "boolean",
      description: "True only for the fallback pack used outside every named region.",
    },
    region: {
      type: "object",
      properties: {
        description: { type: "string", minLength: 1, maxLength: 240 },
        bbox: {
          description: "[minLon, minLat, maxLon, maxLat] in degrees, or null for the generic pack.",
          oneOf: [
            { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
            { type: "null" },
          ],
        },
      },
      required: ["description", "bbox"],
      additionalProperties: false,
    },
    review: {
      type: "object",
      properties: {
        status: { enum: ["expert_reviewed", "needs_expert_review"] },
        note: { type: "string", minLength: 1, maxLength: 600 },
      },
      required: ["status", "note"],
      additionalProperties: false,
    },
    sources: {
      type: "object",
      minProperties: 1,
      propertyNames: ID,
      additionalProperties: {
        type: "object",
        properties: {
          citation: { type: "string", minLength: 1, maxLength: 400 },
          url: { type: "string", format: "uri" },
        },
        required: ["citation"],
        additionalProperties: false,
      },
    },
    calendar: {
      type: "object",
      properties: {
        agricultural_year_start_month: num(1, 12, "First month of the agricultural year.", true),
        sowing_windows: {
          type: "object",
          description:
            "Generic sowing windows used to read sowing dates off NDVI before the crop is known.",
          properties: { autumn: dateWindow, spring: dateWindow },
          required: ["autumn", "spring"],
          additionalProperties: false,
        },
        bare_ndvi_threshold: num(0, 1, "NDVI below this value counts as bare soil."),
      },
      required: ["agricultural_year_start_month", "sowing_windows", "bare_ndvi_threshold"],
      additionalProperties: false,
    },
    crops: { type: "array", minItems: 3, items: { oneOf: [crop, fallow] } },
    pests: { type: "array", minItems: 1, items: pest },
  },
  required: [
    "schema",
    "id",
    "name",
    "version",
    "generic",
    "region",
    "review",
    "sources",
    "calendar",
    "crops",
    "pests",
  ],
  additionalProperties: false,
};
