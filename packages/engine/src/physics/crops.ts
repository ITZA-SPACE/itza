import type { CropEntry } from "@itza/knowledge";
import { dayNumberOfMonthDay } from "./dates";

/** A crop or cover crop from a knowledge pack. Fallow has no crop parameters. */
export type Crop = Extract<CropEntry, { kind: "crop" | "cover" }>;

export const STAGE_NAMES = ["ini", "dev", "mid", "late"] as const;
/** 0 initial, 1 development, 2 mid-season, 3 late season. */
export type StageIndex = 0 | 1 | 2 | 3;

/**
 * Relative sensitivity of each stage, in the order initial, development, mid, late. Mid-season
 * (flowering and grain fill) counts most (FAO yield-response idea, Doorenbos and Kassam 1979).
 * These are engine defaults, not pack data.
 */
export const STAGE_SENSITIVITY = {
  water: [0.2, 0.5, 1, 0.6],
  frost: [0.3, 0.5, 1, 0.6],
  heat: [0.2, 0.4, 1, 0.7],
} as const;

export function isCrop(entry: CropEntry): entry is Crop {
  return entry.kind !== "fallow";
}

export function stageLengths(crop: Crop): [number, number, number, number] {
  const d = crop.stage_days;
  return [d.ini.value, d.dev.value, d.mid.value, d.late.value];
}

export function seasonLength(crop: Crop): number {
  return crop.season_length_days.value;
}

/** Stage on day `d` after sowing (day 0 is the sowing day), or null outside the season. */
export function stageAt(crop: Crop, d: number): StageIndex | null {
  if (d < 0 || d >= seasonLength(crop)) return null;
  const days = crop.stage_days;
  const ini = days.ini.value;
  const dev = days.dev.value;
  if (d < ini) return 0;
  if (d < ini + dev) return 1;
  if (d < ini + dev + days.mid.value) return 2;
  return 3;
}

/** FAO-56 four-stage single crop coefficient (eq. 66): flat, rising, flat, falling. */
export function kcAt(crop: Crop, d: number): number {
  const days = crop.stage_days;
  const ini = days.ini.value;
  const dev = days.dev.value;
  const mid = days.mid.value;
  const late = days.late.value;
  const kcIni = crop.kc_ini.value;
  const kcMid = crop.kc_mid.value;
  const kcEnd = crop.kc_end.value;
  if (d < ini) return kcIni;
  if (d < ini + dev) return kcIni + ((d - ini) / dev) * (kcMid - kcIni);
  if (d < ini + dev + mid) return kcMid;
  return kcMid + (Math.min(d - ini - dev - mid, late) / late) * (kcEnd - kcMid);
}

/** Rooting depth in metres: grows linearly from emergence depth to the maximum by the end of development. */
export function rootDepthAt(crop: Crop, d: number): number {
  const ini = crop.stage_days.ini.value;
  const dev = crop.stage_days.dev.value;
  const from = crop.root_depth_ini_m.value;
  const to = crop.root_depth_max_m.value;
  return d >= ini + dev ? to : from + (Math.max(d, 0) / (ini + dev)) * (to - from);
}

/** Daily Kc, rooting depth and stage of one crop over its season, indexed by day after sowing. */
export interface CropCurves {
  kc: Float64Array;
  zr: Float64Array;
  stage: Int8Array;
}

const curveCache = new WeakMap<Crop, CropCurves>();

/**
 * The crop's daily curves, computed once per crop object. Replays run the same crop over many
 * seasons and parameter draws, so sharing them removes most per-day lookups. Crops are treated as
 * immutable (knowledge packs are frozen); a changed crop must be a new object.
 */
export function cropCurves(crop: Crop): CropCurves {
  let curves = curveCache.get(crop);
  if (!curves) {
    const n = seasonLength(crop);
    curves = { kc: new Float64Array(n), zr: new Float64Array(n), stage: new Int8Array(n) };
    for (let d = 0; d < n; d++) {
      curves.kc[d] = kcAt(crop, d);
      curves.zr[d] = rootDepthAt(crop, d);
      curves.stage[d] = stageAt(crop, d) ?? 3;
    }
    curveCache.set(crop, curves);
  }
  return curves;
}

/** Middle of the pack's sowing window for a season that starts in `year`, as a day number. */
export function defaultSowingDay(crop: Crop, year: number): number {
  const { start, end } = crop.sowing_window;
  const from = dayNumberOfMonthDay(year, start);
  let to = dayNumberOfMonthDay(year, end);
  if (to < from) to = dayNumberOfMonthDay(year + 1, end);
  return Math.floor((from + to) / 2);
}
