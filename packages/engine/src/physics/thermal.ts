import { type Crop, STAGE_SENSITIVITY, seasonLength, stageAt } from "./crops";

export interface ThermalSummary {
  /** Frost and heat days in each stage: initial, development, mid, late. */
  frostDays: [number, number, number, number];
  heatDays: [number, number, number, number];
  /** Event counts weighted by stage sensitivity. */
  frostIndex: number;
  heatIndex: number;
  /** Growing degree days of the season, from the crop's base and upper temperature. */
  gdd: number;
  /** Days of the season covered by the temperature series. */
  days: number;
}

/**
 * Growing degree days of one day: mean of the daily extremes with the minimum raised to `base` and
 * the maximum capped at `upper`, minus `base`, never below 0.
 */
export function degreeDays(
  tmax: number,
  tmin: number,
  base: number,
  upper = Number.POSITIVE_INFINITY,
): number {
  const hi = Math.min(tmax, upper);
  const lo = Math.max(tmin, base);
  return Math.max(0, (Math.max(hi, base) + lo) / 2 - base);
}

/**
 * Frost and heat exposure of one crop season. `sowingIndex` is the position of the sowing day in
 * the temperature arrays; the season is cut short where the arrays end. A day is a frost day when
 * Tmin is at or below the stage's frost threshold and a heat day when Tmax is at or above its heat
 * threshold.
 */
export function thermalStress(
  crop: Crop,
  sowingIndex: number,
  tmax: ArrayLike<number>,
  tmin: ArrayLike<number>,
): ThermalSummary {
  const frostDays: [number, number, number, number] = [0, 0, 0, 0];
  const heatDays: [number, number, number, number] = [0, 0, 0, 0];
  const frost = crop.frost_threshold_c;
  const heat = crop.heat_threshold_c;
  const frostLimit = [frost.ini.value, frost.dev.value, frost.mid.value, frost.late.value];
  const heatLimit = [heat.ini.value, heat.dev.value, heat.mid.value, heat.late.value];
  let gdd = 0;
  let days = 0;
  const last = Math.min(seasonLength(crop), tmax.length - sowingIndex);
  for (let d = Math.max(0, -sowingIndex); d < last; d++) {
    const i = sowingIndex + d;
    const stage = stageAt(crop, d) as 0 | 1 | 2 | 3;
    const hi = tmax[i] as number;
    const lo = tmin[i] as number;
    if (lo <= (frostLimit[stage] as number)) frostDays[stage]++;
    if (hi >= (heatLimit[stage] as number)) heatDays[stage]++;
    gdd += degreeDays(hi, lo, crop.t_base_c.value, crop.t_max_c.value);
    days++;
  }
  const weighted = (counts: number[], weights: readonly number[]) =>
    counts.reduce((sum, c, s) => sum + c * (weights[s] as number), 0);
  return {
    frostDays,
    heatDays,
    frostIndex: weighted(frostDays, STAGE_SENSITIVITY.frost),
    heatIndex: weighted(heatDays, STAGE_SENSITIVITY.heat),
    gdd,
    days,
  };
}
