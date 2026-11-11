import type { CanonicalSeries, EngineInput, FieldBundle } from "../../src/contracts";
import { mulberry32 } from "../../src/replay";
import { loadBundle } from "../physics/helpers";

const DAY_MS = 86_400_000;

/**
 * A field bundle with `years` agricultural years (from 1 September `startYear`) of seeded synthetic
 * weather in the style of the Algerian high plains: wet winters and springs, hot dry summers, and
 * year-to-year swings in rain and heat. Invented numbers for tests only.
 */
export function makeBundle(years: number, seed = 7, startYear = 2000): FieldBundle {
  const template = loadBundle("semi-arid-winter-cereal");
  const start = Date.UTC(startYear, 8, 1);
  const days = Math.round((Date.UTC(startYear + years, 8, 1) - start) / DAY_MS);
  const next = mulberry32(seed);
  const yearRain = Array.from({ length: years + 1 }, () => 0.5 + 1.1 * next());
  const yearHeat = Array.from({ length: years + 1 }, () => (next() - 0.5) * 3);
  const tmax: number[] = [];
  const tmin: number[] = [];
  const precip: number[] = [];
  const srad: number[] = [];
  const wind: number[] = [];
  const rh: number[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * DAY_MS);
    const doy = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / DAY_MS;
    const phase = Math.sin(((doy - 110) / 365) * 2 * Math.PI);
    const y = Math.floor(i / 365.25);
    const heat = yearHeat[y] as number;
    const noise = (next() - 0.5) * 6;
    const hi = 21 + 12 * phase + heat + noise;
    tmax.push(round(hi));
    tmin.push(round(hi - 11 - 2 * next()));
    const wetChance = (0.28 - 0.18 * Math.max(0, phase)) * (yearRain[y] as number);
    precip.push(next() < wetChance ? round(-Math.log(1 - next()) * 6) : 0);
    srad.push(round(Math.max(3, 16 + 9 * phase - 6 * next() * (precip.at(-1) ? 1 : 0.2))));
    wind.push(round(1.5 + 1.5 * next()));
    rh.push(round(Math.min(95, Math.max(15, 60 - 22 * phase + (next() - 0.5) * 20))));
  }
  const daily = (name: CanonicalSeries["var"], unit: string, values: number[]): CanonicalSeries => {
    const source = template.series.find((s) => s.var === name) as CanonicalSeries;
    return {
      ...source,
      unit,
      start: new Date(start).toISOString().slice(0, 10),
      values,
      quality: values.map(() => 0),
      provenance: {
        ...source.provenance,
        period: {
          start: new Date(start).toISOString().slice(0, 10),
          end: new Date(start + (days - 1) * DAY_MS).toISOString().slice(0, 10),
        },
      },
    };
  };
  const keep = template.series.filter(
    (s) =>
      !["tmax", "tmin", "tmean", "precip", "srad", "wind2m", "rh", "sm_rootzone"].includes(s.var),
  );
  return {
    ...template,
    series: [
      daily("tmax", "degC", tmax),
      daily("tmin", "degC", tmin),
      daily("precip", "mm/day", precip),
      daily("srad", "MJ/m2/day", srad),
      daily("wind2m", "m/s", wind),
      daily("rh", "percent", rh),
      ...keep,
    ],
  };
}

const round = (x: number) => Math.round(x * 10) / 10;

export const SOIL: EngineInput["soil"] = {
  clay_pct: { value: 34, source: "soilgrids", confidence: "medium" },
  sand_pct: { value: 28, source: "soilgrids", confidence: "medium" },
  awc_mm_per_m: { value: 140, source: "user_soil_test", confidence: "high" },
};

export const PRIORITIES: EngineInput["priorities"] = {
  water: 4,
  soil_health: 3,
  nitrogen: 2,
  erosion: 3,
  forage: 1,
  income: 3,
  pest_break: 2,
};

export type Rotations = EngineInput["rotations"];

/** Rotations of the Algerian high plains pack, for tests. */
export const ROTATIONS: Rotations = [
  { id: "wheat_continuous", seasons: [{ crop: "durum_wheat" }] },
  { id: "wheat_fallow", seasons: [{ crop: "durum_wheat" }, { crop: "fallow" }] },
  {
    id: "wheat_lentil_barley",
    seasons: [{ crop: "durum_wheat" }, { crop: "lentil" }, { crop: "barley" }],
  },
  { id: "wheat_chickpea", seasons: [{ crop: "durum_wheat" }, { crop: "chickpea" }] },
  {
    id: "barley_vetch_fallow",
    seasons: [{ crop: "barley" }, { crop: "vetch_oat_forage" }, { crop: "fallow" }],
  },
  { id: "wheat_pea", seasons: [{ crop: "bread_wheat" }, { crop: "field_pea" }] },
  { id: "barley_continuous", seasons: [{ crop: "barley" }] },
  {
    id: "wheat_faba_barley_fallow",
    seasons: [
      { crop: "durum_wheat" },
      { crop: "faba_bean" },
      { crop: "barley" },
      { crop: "fallow" },
    ],
  },
  { id: "wheat_cover", seasons: [{ crop: "durum_wheat" }, { crop: "cover_crop" }] },
  { id: "oats_lentil", seasons: [{ crop: "oats" }, { crop: "lentil" }] },
];

export function makeInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    schema: "engine-input/1.0",
    rotations: ROTATIONS,
    baseline: ROTATIONS[0] as Rotations[number],
    soil: SOIL,
    priorities: PRIORITIES,
    constraints: { irrigation: { level: "none" }, livestock: true },
    scenario: { id: "history", kind: "history" },
    seed: 42,
    monte_carlo_draws: 200,
    ...overrides,
  };
}
