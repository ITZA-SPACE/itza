import type { CropEntry } from "@itza/knowledge";
import { type Crop, isCrop, kcAt, seasonLength } from "../physics";
import { clamp01 } from "./stats";

/** Net nitrogen left for the next crop, in kg N/ha, that maps to the best (+) and worst (-) score. */
export const N_RANGE_KG_HA = 60;
/** Share of the soil a full residue layer covers (engine default, not pack data). */
export const RESIDUE_COVER_MAX = 0.6;
/** A month counts as covered when at least this share of the soil is covered. */
export const COVERED_MONTH_MIN = 0.2;
/** Canopy cover from Kc: Kc minus the bare-soil floor, the proxy the water balance uses for runoff. */
const CANOPY_KC_FLOOR = 0.15;
const DAYS_PER_MONTH = 30.4;

/** Score 0 to 1 of the nitrogen a season starts with, from the previous crop's credit; 0.5 is neutral. */
export function nitrogenScore(previousCreditKgHa: number): number {
  return clamp01(0.5 + previousCreditKgHa / (2 * N_RANGE_KG_HA));
}

/** Relative residue and root biomass a crop returns to the soil, 0 to 1. */
export function organicMatterScore(entry: CropEntry): number {
  return clamp01(entry.residue_root_index.value);
}

/** Months of the agricultural year as day-number spans `[start, end)`. */
export interface MonthSpan {
  start: number;
  end: number;
}

/** Canopy cover of each day after sowing, from Kc scaled by `kcFactor` (0 to 1). */
export function canopyCurve(crop: Crop, kcFactor = 1): Float64Array {
  const curve = new Float64Array(seasonLength(crop));
  for (let d = 0; d < curve.length; d++) {
    curve[d] = Math.min(1, Math.max(0, kcAt(crop, d) * kcFactor - CANOPY_KC_FLOOR));
  }
  return curve;
}

/**
 * Ground cover per month of the agricultural year, 0 to 1. A crop covers the soil with its canopy
 * (`canopy`, from `canopyCurve`) while it grows; after harvest its residue covers a share of the soil
 * for as many months as the pack's `cover_months` allows since sowing. Fallow has residue cover for
 * the first `cover_months` months. Stubble carried over from the previous crop is not counted.
 */
export function monthlyCover(
  entry: CropEntry,
  sowingDay: number,
  spans: readonly MonthSpan[],
  canopy: Float64Array | null,
  out: Float64Array = new Float64Array(spans.length),
): Float64Array {
  const residue = clamp01(entry.residue_root_index.value) * RESIDUE_COVER_MAX;
  const coverMonths = entry.cover_months.value;
  if (!isCrop(entry) || canopy === null) {
    for (let m = 0; m < spans.length; m++) out[m] = m < coverMonths ? residue : 0;
    return out;
  }
  const harvestDay = sowingDay + canopy.length;
  for (let m = 0; m < spans.length; m++) {
    const { start, end } = spans[m] as MonthSpan;
    let living = 0;
    for (let day = Math.max(start, sowingDay); day < Math.min(end, harvestDay); day++) {
      living += canopy[day - sowingDay] as number;
    }
    const afterHarvest = Math.max(0, end - Math.max(start, harvestDay)) / (end - start);
    const covered = (start - sowingDay) / DAYS_PER_MONTH < coverMonths;
    out[m] = clamp01(living / (end - start) + (covered ? afterHarvest * residue : 0));
  }
  return out;
}

/** Number of months whose cover reaches `COVERED_MONTH_MIN`. */
export function groundCoverMonths(cover: ArrayLike<number>): number {
  let months = 0;
  for (let m = 0; m < cover.length; m++) if ((cover[m] as number) >= COVERED_MONTH_MIN) months++;
  return months;
}
