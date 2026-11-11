import type { CanonicalSeries, FieldBundle, Provenance } from "../contracts";
import { fromDayNumber, toDayNumber, toIsoDate } from "./dates";
import { et0Daily } from "./et0";
import { derivedProvenance } from "./provenance";

/** Daily weather and reference ET0 on one day grid, ready for the water balance. */
export interface DailyForcing {
  /** Day number of the first day. */
  startDay: number;
  days: number;
  tmax: Float64Array;
  tmin: Float64Array;
  precip: Float64Array;
  et0: Float64Array;
  latitudeDeg: number;
  elevationM: number;
  /** Days that had no usable observation and were filled. */
  gaps: { temperature: number; precip: number; et0: number };
  provenance: Provenance;
}

const REQUIRED = ["tmax", "tmin", "precip", "srad", "wind2m"] as const;

function find(bundle: FieldBundle, name: CanonicalSeries["var"]): CanonicalSeries | undefined {
  return bundle.series.find((s) => s.var === name && s.cadence === "daily");
}

/** Observed values by day number; missing and flagged-missing steps are left out. */
function observed(series: CanonicalSeries | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!series) return out;
  const start = toDayNumber(series.start);
  series.values.forEach((v, i) => {
    if (v !== null && series.quality[i] !== 2 && Number.isFinite(v)) out.set(start + i, v);
  });
  return out;
}

/** Nearest valid value in `values` for index i (previous first, then next). */
function nearest(values: (number | null)[], i: number): number {
  for (let k = 0; k < values.length; k++) {
    const before = values[i - k];
    if (before !== null && before !== undefined) return before;
    const after = values[i + k];
    if (after !== null && after !== undefined) return after;
  }
  return 0;
}

/**
 * Builds the daily forcing of a field bundle over the days where every required series exists.
 * Gap policy: temperatures take the nearest valid day, precipitation is 0 mm, and a day without
 * the inputs for ET0 gets the mean ET0 of that day of year over the valid days. The number of
 * filled days is reported in `gaps` so confidence can drop with them.
 */
export function buildDailyForcing(bundle: FieldBundle): DailyForcing {
  const series = Object.fromEntries(REQUIRED.map((name) => [name, find(bundle, name)]));
  const missing = REQUIRED.filter((name) => !series[name]);
  if (missing.length > 0) throw new RangeError(`Bundle lacks daily series: ${missing.join(", ")}`);
  const used = REQUIRED.map((name) => series[name] as CanonicalSeries);
  const rhSeries = find(bundle, "rh");
  const meanSeries = find(bundle, "tmean");
  const all = [...used, ...(rhSeries ? [rhSeries] : []), ...(meanSeries ? [meanSeries] : [])];

  const ends = used.map((s) => toDayNumber(s.start) + s.values.length);
  const startDay = Math.max(...used.map((s) => toDayNumber(s.start)));
  const days = Math.min(...ends) - startDay;
  if (days <= 0) throw new RangeError("Daily series do not overlap");

  const obs = Object.fromEntries(REQUIRED.map((name) => [name, observed(series[name])]));
  const rh = observed(rhSeries);
  const mean = observed(meanSeries);
  const latitudeDeg = bundle.field.centroid[1];
  const elevationM = bundle.field.elevation_m;

  const tmaxRaw: (number | null)[] = [];
  const tminRaw: (number | null)[] = [];
  const et0Raw: (number | null)[] = [];
  const precip = new Float64Array(days);
  let precipGaps = 0;
  for (let i = 0; i < days; i++) {
    const day = startDay + i;
    const tmax = obs.tmax?.get(day) ?? null;
    const tmin = obs.tmin?.get(day) ?? null;
    tmaxRaw.push(tmax);
    tminRaw.push(tmin);
    const p = obs.precip?.get(day);
    if (p === undefined) precipGaps++;
    precip[i] = p === undefined ? 0 : Math.max(0, p);

    const srad = obs.srad?.get(day);
    const wind = obs.wind2m?.get(day);
    if (tmax === null || tmin === null || srad === undefined || wind === undefined) {
      et0Raw.push(null);
      continue;
    }
    const base = {
      tmax,
      tmin,
      wind2m: wind,
      srad,
      elevationM,
      latitudeDeg,
      doy: fromDayNumber(day).doy,
    };
    const tmean = mean.get(day);
    const humidity = rh.get(day);
    et0Raw.push(
      et0Daily({
        ...base,
        ...(tmean === undefined ? {} : { tmean }),
        ...(humidity === undefined ? {} : { rhMean: humidity }),
      }),
    );
  }

  // Mean ET0 by day of year over the valid days, for filling gaps.
  const sums = new Map<number, [number, number]>();
  let total = 0;
  let count = 0;
  et0Raw.forEach((v, i) => {
    if (v === null) return;
    const doy = fromDayNumber(startDay + i).doy;
    const entry = sums.get(doy) ?? [0, 0];
    sums.set(doy, [entry[0] + v, entry[1] + 1]);
    total += v;
    count++;
  });
  const overall = count > 0 ? total / count : 0;

  const et0 = new Float64Array(days);
  const tmax = new Float64Array(days);
  const tmin = new Float64Array(days);
  let et0Gaps = 0;
  let temperatureGaps = 0;
  for (let i = 0; i < days; i++) {
    const v = et0Raw[i] as number | null;
    if (v === null) {
      et0Gaps++;
      const entry = sums.get(fromDayNumber(startDay + i).doy);
      et0[i] = entry ? entry[0] / entry[1] : overall;
    } else {
      et0[i] = v;
    }
    if (tmaxRaw[i] === null || tminRaw[i] === null) temperatureGaps++;
    tmax[i] = nearest(tmaxRaw, i);
    tmin[i] = nearest(tminRaw, i);
  }

  return {
    startDay,
    days,
    tmax,
    tmin,
    precip,
    et0,
    latitudeDeg,
    elevationM,
    gaps: { temperature: temperatureGaps, precip: precipGaps, et0: et0Gaps },
    provenance: derivedProvenance(
      all,
      "Daily forcing and FAO-56 reference ET0",
      { start: toIsoDate(startDay), end: toIsoDate(startDay + days - 1) },
      "FAO-56 Penman-Monteith on POWER-style daily inputs; gaps filled as documented",
    ),
  };
}
