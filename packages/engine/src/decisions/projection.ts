import type { EngineInput, FieldBundle, MonthlyFactors, Scenario } from "../contracts";
import { scoreReplay, simulateReplay } from "../replay";
import type { ScenarioVariable } from "./scenarios";

const VARIABLES: readonly ScenarioVariable[] = [
  "tmax",
  "tmin",
  "tmean",
  "precip",
  "rh",
  "wind",
  "srad",
];
const KINDS = ["additive", "multiplicative"] as const;

export type ProjectionSpread = "median" | "low" | "high";

/** Monthly change factors of one variable under one SSP, as `/v1/projection` returns them. */
export interface ProjectionVariable {
  kind: (typeof KINDS)[number];
  unit: string;
  /** Number of climate models behind the median and the spread. */
  models: number;
  /** Twelve values, index 0 is January. */
  median: MonthlyFactors["values"];
  min: MonthlyFactors["values"];
  max: MonthlyFactors["values"];
}

/** The parts of the `/v1/projection` response (science API, `schemas/projection.schema.json`) the engine uses. */
export interface ProjectionPayload {
  scenarios: Record<string, Partial<Record<ScenarioVariable, ProjectionVariable>>>;
  provenance: {
    source: string;
    source_version: string | null;
    path: "power" | "archive";
    resolution_deg: number;
    baseline_period: string;
    future_period: string;
    models: string[];
  };
}

function fail(path: string, expected: string): never {
  throw new RangeError(`Projection payload: ${path} must be ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function twelve(value: unknown, path: string): MonthlyFactors["values"] {
  if (
    !Array.isArray(value) ||
    value.length !== 12 ||
    !value.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    fail(path, "twelve finite numbers");
  }
  return value as MonthlyFactors["values"];
}

/** Checks a `/v1/projection` response at the boundary and returns the part the engine uses. */
export function parseProjection(payload: unknown): ProjectionPayload {
  if (!isRecord(payload)) fail("the payload", "an object");
  const { scenarios, provenance } = payload;
  if (!isRecord(scenarios) || Object.keys(scenarios).length === 0)
    fail("scenarios", "a non-empty object");
  if (!isRecord(provenance)) fail("provenance", "an object");
  const out: ProjectionPayload["scenarios"] = {};
  for (const [ssp, variables] of Object.entries(scenarios)) {
    if (!isRecord(variables)) fail(`scenarios.${ssp}`, "an object");
    const parsed: Partial<Record<ScenarioVariable, ProjectionVariable>> = {};
    for (const [name, raw] of Object.entries(variables)) {
      const at = `scenarios.${ssp}.${name}`;
      if (!VARIABLES.includes(name as ScenarioVariable)) fail(at, `one of ${VARIABLES.join(", ")}`);
      if (!isRecord(raw)) fail(at, "an object");
      if (!KINDS.includes(raw.kind as (typeof KINDS)[number]))
        fail(`${at}.kind`, "additive or multiplicative");
      parsed[name as ScenarioVariable] = {
        kind: raw.kind as ProjectionVariable["kind"],
        unit: typeof raw.unit === "string" ? raw.unit : "",
        models: typeof raw.models === "number" ? raw.models : 0,
        median: twelve(raw.median, `${at}.median`),
        min: twelve(raw.min, `${at}.min`),
        max: twelve(raw.max, `${at}.max`),
      };
    }
    if (!parsed.tmax || !parsed.precip)
      fail(`scenarios.${ssp}`, "present with at least tmax and precip");
    out[ssp] = parsed;
  }
  const text = (key: string) =>
    typeof provenance[key] === "string"
      ? (provenance[key] as string)
      : fail(`provenance.${key}`, "a string");
  return {
    scenarios: out,
    provenance: {
      source: text("source"),
      source_version:
        typeof provenance.source_version === "string" ? provenance.source_version : null,
      path: provenance.path === "archive" ? "archive" : "power",
      resolution_deg:
        typeof provenance.resolution_deg === "number" ? provenance.resolution_deg : 0.25,
      baseline_period: text("baseline_period"),
      future_period: text("future_period"),
      models: Array.isArray(provenance.models) ? provenance.models.map(String) : [],
    },
  };
}

const SPREAD_KEY = { median: "median", low: "min", high: "max" } as const;

/**
 * The delta-change scenario for one SSP: the payload's monthly factors, applied to the observed
 * daily series. `low` and `high` use each variable's own model minimum and maximum, which bound the
 * model spread variable by variable (they are not one coherent model).
 */
export function projectionScenario(
  payload: ProjectionPayload,
  ssp: string,
  spread: ProjectionSpread,
): Scenario {
  const variables = payload.scenarios[ssp];
  if (!variables) throw new RangeError(`Projection payload has no scenario "${ssp}"`);
  const monthly_factors: Record<string, MonthlyFactors> = {};
  for (const [name, v] of Object.entries(variables) as [ScenarioVariable, ProjectionVariable][]) {
    monthly_factors[name] = { kind: v.kind, values: v[SPREAD_KEY[spread]] };
  }
  const known = ["ssp126", "ssp245", "ssp370", "ssp585"] as const;
  return {
    id: `projection_${ssp}_${spread}`,
    kind: "projection",
    ...(known.includes(ssp as (typeof known)[number])
      ? { ssp: ssp as (typeof known)[number] }
      : {}),
    monthly_factors,
  };
}

/** Distribution metrics of a rotation, and how they move between the history and a 2050 climate. */
export interface RotationShift {
  rotation_id: string;
  history: { score: number; p10: number; worst: number; severe_water_stress_seasons: number };
  /** Score change (projected minus history) with the median model, and the range over the model spread. */
  score: { median: number; min: number; max: number };
  p10: { median: number; min: number; max: number };
  worst: { median: number; min: number; max: number };
  /** Change in the number of replayed seasons with severe water stress, median model. */
  severe_water_stress_seasons: number;
}

export interface SspShift {
  ssp: string;
  rotations: RotationShift[];
}

export interface ProjectionShifts {
  /** One entry per SSP in the payload, in payload order. */
  ssps: SspShift[];
  provenance: ProjectionPayload["provenance"];
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const spreadOf = (values: [number, number, number]) => ({
  median: r6(values[0]),
  min: r6(Math.min(...values)),
  max: r6(Math.max(...values)),
});

export interface ProjectionShiftRequest {
  bundle: FieldBundle;
  input: EngineInput;
  payload: ProjectionPayload;
  packId?: string;
}

/**
 * 2050 delta-change (F-14): replays the rotations on the observed record changed by each SSP's
 * monthly factors, for the median model and for the low and high ends of the model spread, and
 * reports how score, P10 and worst-season score shift against the history replay. Monte Carlo is off
 * (the comparison is between climates, not parameter draws).
 */
export function projectionShifts({
  bundle,
  input,
  payload,
  packId,
}: ProjectionShiftRequest): ProjectionShifts {
  const replay = (scenario: Scenario) =>
    scoreReplay(
      simulateReplay({
        bundle,
        input: { ...input, scenario, monte_carlo_draws: 0 },
        ...(packId ? { packId } : {}),
      }),
      input.priorities,
    );
  const history = replay({ id: "history", kind: "history" });
  const ssps = Object.keys(payload.scenarios).map((ssp): SspShift => {
    const runs = {
      median: replay(projectionScenario(payload, ssp, "median")),
      low: replay(projectionScenario(payload, ssp, "low")),
      high: replay(projectionScenario(payload, ssp, "high")),
    };
    const pick = (output: typeof history, id: string) =>
      output.results.find((r) => r.rotation_id === id);
    const rotations = history.results.map((h): RotationShift => {
      const cases = [runs.median, runs.low, runs.high].map((o) => pick(o, h.rotation_id) ?? h);
      const delta = (read: (r: typeof h) => number): [number, number, number] =>
        cases.map((c) => read(c) - read(h)) as [number, number, number];
      const median = cases[0] ?? h;
      return {
        rotation_id: h.rotation_id,
        history: {
          score: h.score,
          p10: h.resilience.p10,
          worst: h.resilience.worst,
          severe_water_stress_seasons: h.resilience.severe_water_stress_seasons,
        },
        score: spreadOf(delta((r) => r.score)),
        p10: spreadOf(delta((r) => r.resilience.p10)),
        worst: spreadOf(delta((r) => r.resilience.worst)),
        severe_water_stress_seasons:
          median.resilience.severe_water_stress_seasons - h.resilience.severe_water_stress_seasons,
      };
    });
    return { ssp, rotations };
  });
  return { ssps, provenance: payload.provenance };
}
