import type {
  CanonicalSeries,
  EngineOutput,
  FieldBundle,
  MonthlyFactors,
  Scenario,
} from "../contracts";
import { fromDayNumber, toDayNumber } from "../physics";

/** Slider ranges of the scenario controls (F-09). */
export const SLIDER_LIMITS = {
  rainPct: { min: -30, max: 30 },
  tempC: { min: 0, max: 4 },
} as const;

/** Scenario variable (as in `/v1/projection`) to the bundle series it changes. */
const TARGETS = {
  tmax: "tmax",
  tmin: "tmin",
  tmean: "tmean",
  precip: "precip",
  rh: "rh",
  wind: "wind2m",
  srad: "srad",
} as const satisfies Record<string, CanonicalSeries["var"]>;

export type ScenarioVariable = keyof typeof TARGETS;

const SERIES_BOUNDS: Partial<Record<CanonicalSeries["var"], readonly [number, number]>> = {
  precip: [0, Number.POSITIVE_INFINITY],
  rh: [0, 100],
  wind2m: [0, Number.POSITIVE_INFINITY],
  srad: [0, Number.POSITIVE_INFINITY],
};

function inRange(name: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}, got ${value}`);
  }
  return value;
}

/** A slider scenario with the control ranges enforced: rain -30 to +30 %, temperature 0 to +4 C. */
export function sliderScenario(id: string, deltaRainPct: number, deltaTempC: number): Scenario {
  const { rainPct, tempC } = SLIDER_LIMITS;
  return {
    id,
    kind: "slider",
    delta_rain_pct: inRange("Rain change (%)", deltaRainPct, rainPct.min, rainPct.max),
    delta_temp_c: inRange("Temperature change (C)", deltaTempC, tempC.min, tempC.max),
  };
}

export type PresetId = "drought_year" | "hot_spring" | "wet_spring";

/**
 * The documented preset deltas. Spring is March to May in the northern hemisphere and September to
 * November in the southern one.
 *
 * | preset | rain | temperature |
 * |---|---|---|
 * | drought_year | -30 % all year | +1 C all year |
 * | hot_spring | unchanged | +3 C in spring |
 * | wet_spring | +30 % in spring | unchanged |
 */
export const PRESET_DELTAS = {
  drought_year: { rainPct: -30, tempC: 1, springOnly: false },
  hot_spring: { rainPct: 0, tempC: 3, springOnly: true },
  wet_spring: { rainPct: 30, tempC: 0, springOnly: true },
} as const satisfies Record<PresetId, { rainPct: number; tempC: number; springOnly: boolean }>;

export const PRESET_IDS = Object.keys(PRESET_DELTAS) as PresetId[];

export function presetScenario(preset: PresetId, latitudeDeg: number): Scenario {
  const { rainPct, tempC, springOnly } = PRESET_DELTAS[preset];
  if (!springOnly)
    return { id: preset, kind: "slider", delta_rain_pct: rainPct, delta_temp_c: tempC };
  const spring = latitudeDeg >= 0 ? [2, 3, 4] : [8, 9, 10];
  const monthly = (neutral: number, value: number): MonthlyFactors["values"] =>
    Array.from({ length: 12 }, (_, m) =>
      spring.includes(m) ? value : neutral,
    ) as MonthlyFactors["values"];
  const factors: Record<string, MonthlyFactors> = {};
  if (tempC !== 0) {
    for (const name of ["tmax", "tmin", "tmean"]) {
      factors[name] = { kind: "additive", values: monthly(0, tempC) };
    }
  }
  if (rainPct !== 0) {
    factors.precip = { kind: "multiplicative", values: monthly(1, 1 + rainPct / 100) };
  }
  return { id: preset, kind: "slider", monthly_factors: factors };
}

function monthOf(series: CanonicalSeries): Uint8Array {
  const start = toDayNumber(series.start);
  return Uint8Array.from(series.values, (_, i) => fromDayNumber(start + i).month - 1);
}

/**
 * The bundle with the scenario applied to its daily weather: slider deltas first (rain x (1 + dp),
 * temperature + dT), then monthly factors. ET0 follows because it is recomputed from the changed
 * series; relative humidity, wind and radiation are only changed by an explicit factor, so a warmer
 * day keeps its relative humidity. Observed gaps stay gaps and the series keep their quality flags.
 */
export function applyScenario(bundle: FieldBundle, scenario: Scenario): FieldBundle {
  if (scenario.kind === "history") return bundle;
  const factors = scenario.monthly_factors ?? {};
  for (const [name, f] of Object.entries(factors)) {
    if (!(name in TARGETS)) throw new RangeError(`Unknown scenario variable "${name}"`);
    if (f.values.length !== 12)
      throw new RangeError(`Scenario factors for "${name}" need 12 values`);
  }
  const rain = 1 + (scenario.delta_rain_pct ?? 0) / 100;
  const warming = scenario.delta_temp_c ?? 0;

  const series = bundle.series.map((s): CanonicalSeries => {
    if (s.cadence !== "daily") return s;
    const entry = Object.entries(TARGETS).find(([, target]) => target === s.var);
    const name = entry?.[0] as ScenarioVariable | undefined;
    const monthly = name ? factors[name] : undefined;
    const sliderTemp = (s.var === "tmax" || s.var === "tmin" || s.var === "tmean") && warming !== 0;
    const sliderRain = s.var === "precip" && rain !== 1;
    if (!monthly && !sliderTemp && !sliderRain) return s;

    const months = monthly ? monthOf(s) : null;
    const bounds = SERIES_BOUNDS[s.var];
    const values = s.values.map((v, i) => {
      if (v === null) return null;
      let x = v;
      if (sliderTemp) x += warming;
      if (sliderRain) x *= rain;
      if (monthly && months) {
        const f = monthly.values[months[i] as number] as number;
        x = monthly.kind === "additive" ? x + f : x * f;
      }
      return bounds ? Math.min(bounds[1], Math.max(bounds[0], x)) : x;
    });
    return {
      ...s,
      values,
      provenance: {
        ...s.provenance,
        method: `${s.provenance.method ?? "observed"}; scenario ${scenario.id}`,
      },
    };
  });
  return { ...bundle, series };
}

export interface Robustness {
  rotation_id: string;
  /** Largest score drop from history to any scenario; negative when every scenario improves it. */
  worstDrop: number;
  /** Score drop per scenario id (history score minus scenario score). */
  drops: Record<string, number>;
}

/**
 * Robustness readout (F-09): rotations ordered from the smallest to the largest worst-case score
 * drop between the history replay and the scenario replays. The first entry is the most robust.
 */
export function robustness(
  history: EngineOutput,
  scenarios: Readonly<Record<string, EngineOutput>>,
): Robustness[] {
  const entries = Object.entries(scenarios);
  const rows = history.results.map((result): Robustness => {
    const drops: Record<string, number> = {};
    for (const [id, output] of entries) {
      const other = output.results.find((r) => r.rotation_id === result.rotation_id);
      if (other) drops[id] = Math.round((result.score - other.score) * 1e6) / 1e6;
    }
    const values = Object.values(drops);
    return {
      rotation_id: result.rotation_id,
      worstDrop: values.length > 0 ? Math.max(...values) : 0,
      drops,
    };
  });
  const order = new Map(history.results.map((r, i) => [r.rotation_id, i]));
  return rows.sort(
    (a, b) =>
      a.worstDrop - b.worstDrop ||
      (order.get(a.rotation_id) as number) - (order.get(b.rotation_id) as number),
  );
}
