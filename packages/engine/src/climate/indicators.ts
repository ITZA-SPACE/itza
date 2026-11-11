import type { FieldBundle, Period, Provenance } from "../contracts";
import {
  buildDailyForcing,
  type DailyForcing,
  degreeDays,
  derivedProvenance,
  fromDayNumber,
  observedByDay,
  toDayNumber,
  toIsoDate,
} from "../physics";
import { detectWorstSeasons, type WorstSeasons } from "./worst";

/** A dry day has less than 1 mm of rain (the usual agrometeorological threshold). */
const DRY_DAY_MM = 1;

export interface ClimateOptions {
  /** First month of the agricultural year, 1 to 12 (knowledge pack `calendar`). */
  yearStartMonth: number;
  /** Base temperature of the fingerprint's growing degree days. Default 5, a compromise across crops. */
  gddBaseC?: number;
  /** Frost and heat limits of one crop, to add crop-specific day counts. */
  crop?: { frostC: number; heatC: number };
  /** Share of days with observations a season needs to count as usable. Default 0.9. */
  minCoverage?: number;
}

export interface Indicators {
  rainMm: number;
  maxDailyRainMm: number;
  longestDrySpellDays: number;
  /** Days with Tmin below 0 and below -2 degrees C. */
  frostDays0: number;
  frostDays2: number;
  /** Days with Tmax above 30 and above 35 degrees C. */
  heatDays30: number;
  heatDays35: number;
  /** Days at or below the crop frost limit and at or above its heat limit (only with `crop`). */
  cropFrostDays?: number;
  cropHeatDays?: number;
  gdd: number;
  et0Mm: number;
  rainMinusEt0Mm: number;
  /** Mean root-zone soil moisture, m3/m3, and its z-score against the same period of other seasons. */
  soilMoisture: number | null;
  soilMoistureZ: number | null;
  /** Days of rain data per source, following the series `segments` (source policy). */
  precipSourceDays: Record<string, number>;
}

export interface PeriodIndicators extends Indicators {
  /** Season label such as `2021-22`, or month such as `2021-09`. */
  label: string;
  period: Period;
  /** Share of the period's days with observed temperature and rain. */
  coverage: number;
  provenance: Provenance;
}

export interface SeasonIndicators extends PeriodIndicators {
  /** Coverage reaches `minCoverage`: the season may be ranked and replayed. */
  usable: boolean;
  months: PeriodIndicators[];
}

export interface ClimateFingerprint {
  seasons: SeasonIndicators[];
  worst: WorstSeasons;
}

interface Context {
  forcing: DailyForcing;
  options: Required<Omit<ClimateOptions, "crop">> & Pick<ClimateOptions, "crop">;
  soilMoisture: Map<number, number>;
  precipSource: (day: number) => string;
  inputs: Parameters<typeof derivedProvenance>[0];
}

function indicatorsOf(
  ctx: Context,
  from: number,
  to: number,
): Omit<Indicators, "soilMoistureZ"> & { coverage: number } {
  const { forcing, options } = ctx;
  const a = Math.max(from, forcing.startDay);
  const b = Math.min(to, forcing.startDay + forcing.days);
  let rain = 0;
  let maxRain = 0;
  let spell = 0;
  let longest = 0;
  let frost0 = 0;
  let frost2 = 0;
  let heat30 = 0;
  let heat35 = 0;
  let cropFrost = 0;
  let cropHeat = 0;
  let gdd = 0;
  let et0 = 0;
  let observed = 0;
  let smSum = 0;
  let smCount = 0;
  const sources: Record<string, number> = {};
  for (let day = a; day < b; day++) {
    const i = day - forcing.startDay;
    et0 += forcing.et0[i] as number;
    const sm = ctx.soilMoisture.get(day);
    if (sm !== undefined) {
      smSum += sm;
      smCount++;
    }
    if (!forcing.observed[i]) {
      spell = 0;
      continue;
    }
    observed++;
    const p = forcing.precip[i] as number;
    const hi = forcing.tmax[i] as number;
    const lo = forcing.tmin[i] as number;
    rain += p;
    maxRain = Math.max(maxRain, p);
    spell = p < DRY_DAY_MM ? spell + 1 : 0;
    longest = Math.max(longest, spell);
    if (lo < 0) frost0++;
    if (lo < -2) frost2++;
    if (hi > 30) heat30++;
    if (hi > 35) heat35++;
    if (options.crop) {
      if (lo <= options.crop.frostC) cropFrost++;
      if (hi >= options.crop.heatC) cropHeat++;
    }
    gdd += degreeDays(hi, lo, options.gddBaseC);
    const source = ctx.precipSource(day);
    sources[source] = (sources[source] ?? 0) + 1;
  }
  const days = to - from;
  return {
    rainMm: rain,
    maxDailyRainMm: maxRain,
    longestDrySpellDays: longest,
    frostDays0: frost0,
    frostDays2: frost2,
    heatDays30: heat30,
    heatDays35: heat35,
    ...(options.crop ? { cropFrostDays: cropFrost, cropHeatDays: cropHeat } : {}),
    gdd,
    et0Mm: et0,
    rainMinusEt0Mm: rain - et0,
    soilMoisture: smCount > 0 ? smSum / smCount : null,
    precipSourceDays: sources,
    coverage: days > 0 ? observed / days : 0,
  };
}

/** z-score of each entry against the sample; null when fewer than 3 values exist. */
export function zScores(values: readonly (number | null)[]): (number | null)[] {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 3) return values.map(() => null);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / (valid.length - 1));
  return values.map((v) => (v === null ? null : sd < 1e-12 ? 0 : (v - mean) / sd));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Climate Fingerprint (F-04): indicators per agricultural season and month, soil-moisture anomaly
 * against the other seasons, and the worst seasons per hazard. Needs the daily series that
 * `buildDailyForcing` needs; root-zone soil moisture is optional.
 */
export function climateFingerprint(
  bundle: FieldBundle,
  options: ClimateOptions,
): ClimateFingerprint {
  if (
    !Number.isInteger(options.yearStartMonth) ||
    options.yearStartMonth < 1 ||
    options.yearStartMonth > 12
  ) {
    throw new RangeError("yearStartMonth must be an integer from 1 to 12");
  }
  const forcing = buildDailyForcing(bundle);
  const resolved: Context["options"] = {
    yearStartMonth: options.yearStartMonth,
    gddBaseC: options.gddBaseC ?? 5,
    minCoverage: options.minCoverage ?? 0.9,
    ...(options.crop ? { crop: options.crop } : {}),
  };
  const precipSeries = bundle.series.find((s) => s.var === "precip" && s.cadence === "daily");
  const segments = [...(precipSeries?.segments ?? [])]
    .map((s) => ({ day: toDayNumber(s.start), source: s.source }))
    .sort((x, y) => x.day - y.day);
  const defaultSource = precipSeries?.provenance.source ?? "unknown";
  const precipSource = (day: number): string => {
    let source = defaultSource;
    for (const s of segments) {
      if (s.day <= day) source = s.source;
      else break;
    }
    return source;
  };
  const wanted = ["tmax", "tmin", "precip", "srad", "wind2m", "rh", "sm_rootzone"];
  const inputs = bundle.series.filter((s) => s.cadence === "daily" && wanted.includes(s.var));
  const smSeries = bundle.series.find((s) => s.var === "sm_rootzone" && s.cadence === "daily");
  const ctx: Context = {
    forcing,
    options: resolved,
    soilMoisture: observedByDay(smSeries),
    precipSource,
    inputs,
  };

  const first = fromDayNumber(forcing.startDay);
  const last = fromDayNumber(forcing.startDay + forcing.days - 1);
  const startYear = first.month >= resolved.yearStartMonth ? first.year : first.year - 1;
  const endYear = last.month >= resolved.yearStartMonth ? last.year : last.year - 1;

  const provenance = (period: Period): Provenance =>
    derivedProvenance(
      ctx.inputs,
      "Climate Fingerprint",
      period,
      "Daily indicators aggregated per agricultural season and month; ET0 by FAO-56 Penman-Monteith",
    );
  const label = (year: number) =>
    resolved.yearStartMonth === 1 ? `${year}` : `${year}-${pad((year + 1) % 100)}`;

  const seasons: SeasonIndicators[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const from = toDayNumber(`${year}-${pad(resolved.yearStartMonth)}-01`);
    const to = toDayNumber(`${year + 1}-${pad(resolved.yearStartMonth)}-01`);
    const period = { start: toIsoDate(from), end: toIsoDate(to - 1) };
    const total = indicatorsOf(ctx, from, to);
    const months: PeriodIndicators[] = [];
    for (let m = 0; m < 12; m++) {
      const monthIndex = resolved.yearStartMonth - 1 + m;
      const y = year + Math.floor(monthIndex / 12);
      const mo = (monthIndex % 12) + 1;
      const mFrom = toDayNumber(`${y}-${pad(mo)}-01`);
      const mTo = toDayNumber(mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`);
      const { coverage, ...rest } = indicatorsOf(ctx, mFrom, mTo);
      const mPeriod = { start: toIsoDate(mFrom), end: toIsoDate(mTo - 1) };
      months.push({
        ...rest,
        soilMoistureZ: null,
        label: `${y}-${pad(mo)}`,
        period: mPeriod,
        coverage,
        provenance: provenance(mPeriod),
      });
    }
    const { coverage, ...rest } = total;
    seasons.push({
      ...rest,
      soilMoistureZ: null,
      label: label(year),
      period,
      coverage,
      usable: coverage >= resolved.minCoverage,
      provenance: provenance(period),
      months,
    });
  }

  // Soil-moisture anomaly: each season and each calendar month against the other seasons.
  const usable = seasons.filter((s) => s.usable);
  zScores(usable.map((s) => s.soilMoisture)).forEach((z, i) => {
    (usable[i] as SeasonIndicators).soilMoistureZ = z;
  });
  for (let m = 0; m < 12; m++) {
    const group = usable.map((s) => s.months[m] as PeriodIndicators);
    zScores(group.map((x) => x.soilMoisture)).forEach((z, i) => {
      (group[i] as PeriodIndicators).soilMoistureZ = z;
    });
  }

  return { seasons, worst: detectWorstSeasons(seasons) };
}
