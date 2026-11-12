import type { ClimateFingerprint } from "@itza/engine/climate";
import { zScores } from "@itza/engine/climate";
import type { CanonicalSeries, FieldBundle } from "@itza/engine/contracts";
import { buildDailyForcing, type DailyForcing, toDayNumber } from "@itza/engine/physics";
import type { SeasonFeatures, StageFeatures } from "./types";

/** The model's calendar stages cover January to June of the harvest year, 46 days each (the last takes the rest). */
const STAGE_DAYS = 46;
const DRY_DAY_MM = 1;
const MIN_OBSERVED = 0.9;
const STEP_DAYS: Partial<Record<CanonicalSeries["cadence"], number>> = {
  daily: 1,
  weekly: 7,
  "16day": 16,
};
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Harvest year of a season label: `2021-22` is harvested in 2022, `2022` (calendar year) in 2022. */
export const harvestYear = (label: string): number =>
  Number.parseInt(label.slice(0, 4), 10) + (label.includes("-") ? 1 : 0);

/** Stage features of the January to June window of `year`; null when the weather does not cover it. */
export function stageFeatures(
  forcing: DailyForcing,
  year: number,
): Pick<SeasonFeatures, "initial" | "development" | "mid" | "late"> | null {
  const first = toDayNumber(`${year}-01-01`);
  const end = toDayNumber(`${year}-07-01`);
  if (first < forcing.startDay || end > forcing.startDay + forcing.days) return null;
  let observed = 0;
  for (let d = first; d < end; d++) observed += forcing.observed[d - forcing.startDay] as number;
  if (observed / (end - first) < MIN_OBSERVED) return null;

  const stages = [0, 1, 2, 3].map((index): StageFeatures => {
    const from = first + index * STAGE_DAYS;
    const to = index === 3 ? end : from + STAGE_DAYS;
    let rain = 0;
    let et0 = 0;
    let spell = 0;
    let longest = 0;
    let frost = 0;
    let heat = 0;
    for (let d = from; d < to; d++) {
      const i = d - forcing.startDay;
      const p = forcing.precip[i] as number;
      rain += p;
      et0 += forcing.et0[i] as number;
      spell = p < DRY_DAY_MM ? spell + 1 : 0;
      longest = Math.max(longest, spell);
      if ((forcing.tmin[i] as number) < 0) frost++;
      if ((forcing.tmax[i] as number) > 35) heat++;
    }
    const r = round3(rain);
    const e = round3(et0);
    return {
      rain_mm: r,
      dry_spell_days: longest,
      et0_mm: e,
      balance_mm: r - e,
      frost_days: frost,
      heat_days: heat,
    };
  }) as [StageFeatures, StageFeatures, StageFeatures, StageFeatures];
  const [initial, development, mid, late] = stages;
  return { initial, development, mid, late };
}

/** Peak NDVI of January to June of each year, from the bundle's NDVI series; years with fewer than 3 observations are left out. */
export function ndviPeaks(series: CanonicalSeries | undefined): Map<number, number> {
  const peaks = new Map<number, number>();
  const step = series && STEP_DAYS[series.cadence];
  if (!series || !step) return peaks;
  const start = toDayNumber(series.start);
  const counts = new Map<number, number>();
  series.values.forEach((v, i) => {
    if (v === null || series.quality[i] === 2 || !Number.isFinite(v)) return;
    const date = new Date((start + i * step) * 86_400_000);
    if (date.getUTCMonth() > 5) return;
    const year = date.getUTCFullYear();
    peaks.set(year, Math.max(peaks.get(year) ?? Number.NEGATIVE_INFINITY, v));
    counts.set(year, (counts.get(year) ?? 0) + 1);
  });
  for (const [year, n] of counts) if (n < 3) peaks.delete(year);
  return peaks;
}

export interface SeasonInputs {
  label: string;
  /** Null when the weather does not cover the model's window. */
  features: SeasonFeatures | null;
  /** NDVI peak anomaly against the field's other seasons; null with fewer than 3 seasons. */
  ndviZ: number | null;
  ndviPeak: number | null;
  /** Root-zone moisture anomaly of the season (Climate Fingerprint). */
  smapZ: number | null;
}

export interface ArenaInputs {
  seasons: SeasonInputs[];
  forcing: DailyForcing;
  ndvi: CanonicalSeries | undefined;
}

/** What the ML model and the observation opinion need for each usable season of the field. */
export function arenaInputs(bundle: FieldBundle, fingerprint: ClimateFingerprint): ArenaInputs {
  const forcing = buildDailyForcing(bundle);
  const ndvi = bundle.series.find((s) => s.var === "ndvi");
  const peaks = ndviPeaks(ndvi);
  const usable = fingerprint.seasons.filter((s) => s.usable);
  const years = usable.map((s) => harvestYear(s.label));
  const peakList = years.map((y) => peaks.get(y) ?? null);
  const z = zScores(peakList);
  const awc = bundle.soil.awc_mm_per_m?.value;
  const slope = bundle.series.find((s) => s.var === "slope")?.values.find((v) => v !== null);
  const seasons = usable.map((s, i): SeasonInputs => {
    const stages = stageFeatures(forcing, years[i] as number);
    const previous = peaks.get((years[i] as number) - 1);
    return {
      label: s.label,
      features: stages && {
        ...stages,
        ...(s.soilMoistureZ !== null && Math.abs(s.soilMoistureZ) <= 20
          ? { smap_rootzone_anomaly: s.soilMoistureZ }
          : {}),
        ...(previous !== undefined ? { previous_peak_ndvi: previous } : {}),
        ...(typeof awc === "number" && awc > 0 && awc <= 1000 ? { soil_awc_mm_m: awc } : {}),
        ...(typeof slope === "number" && slope >= 0 && slope <= 90 ? { slope_deg: slope } : {}),
      },
      ndviZ: z[i] ?? null,
      ndviPeak: peakList[i] ?? null,
      smapZ: s.soilMoistureZ,
    };
  });
  return { seasons, forcing, ndvi };
}
