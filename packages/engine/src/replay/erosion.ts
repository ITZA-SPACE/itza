import type { DailyForcing } from "../physics";
import type { MonthSpan } from "./soilHealth";

/** Wet-day rainfall at which the intensity factor reaches 1, mm/day (engine default). */
const INTENSE_DAY_MM = 30;
const WET_DAY_MM = 1;
/** RUSLE-style slope factor at 10 % slope; the index reaches its slope maximum there. */
const SLOPE_REF = 0.065 + 0.045 * 10 + 0.0065 * 100;

/** Rain statistics of one agricultural year that do not depend on the rotation. */
export interface YearRain {
  /** 95th percentile of wet-day rain over INTENSE_DAY_MM, capped at 1. */
  intensity: number;
  /** Share of the year's rain erosivity (sum of squared daily rain) in each month; sums to 1. */
  monthlyShare: Float64Array;
}

export function yearRain(forcing: DailyForcing, spans: readonly MonthSpan[]): YearRain {
  const wet: number[] = [];
  const share = new Float64Array(spans.length);
  let total = 0;
  spans.forEach(({ start, end }, m) => {
    for (let day = start; day < end; day++) {
      const p = forcing.precip[day - forcing.startDay] as number;
      if (p >= WET_DAY_MM) wet.push(p);
      share[m] = (share[m] as number) + p * p;
    }
    total += share[m] as number;
  });
  for (let m = 0; m < share.length; m++) {
    share[m] = total > 0 ? (share[m] as number) / total : 1 / share.length;
  }
  wet.sort((a, b) => a - b);
  const p95 =
    wet.length > 0 ? (wet[Math.min(wet.length - 1, Math.floor(0.95 * wet.length))] as number) : 0;
  return { intensity: Math.min(1, p95 / INTENSE_DAY_MM), monthlyShare: share };
}

/** Slope factor 0 to 1 from the mean slope in degrees (RUSLE-style polynomial, capped at 10 %). */
export function slopeFactor(slopeDeg: number): number {
  const percent = Math.tan((slopeDeg * Math.PI) / 180) * 100;
  return Math.min(1, (0.065 + 0.045 * percent + 0.0065 * percent * percent) / SLOPE_REF);
}

/**
 * Relative erosion index 0 to 1: slope x rain intensity x the share of the year's erosive rain that
 * falls on uncovered soil. It ranks rotations; it never claims tonnes of soil.
 */
export function erosionIndex(slope: number, rain: YearRain, cover: ArrayLike<number>): number {
  let exposed = 0;
  for (let m = 0; m < cover.length; m++) {
    exposed += (rain.monthlyShare[m] as number) * (1 - (cover[m] as number));
  }
  return slope * rain.intensity * exposed;
}
