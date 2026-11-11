// biome-ignore-all lint/complexity/useMathMinMax: the daily loop uses plain comparisons on purpose; Math.min and Math.max add NaN and signed-zero handling that measurably slows it
import {
  type Crop,
  type CropCurves,
  cropCurves,
  rootDepthAt,
  STAGE_SENSITIVITY,
  seasonLength,
} from "./crops";
import type { HydrologicGroup, SoilParams } from "./soil";

/**
 * Daily root-zone water balance (FAO-56 chapter 8, single crop coefficient) with SCS curve-number
 * runoff and a bare-soil evaporation layer for fallow.
 *
 * Dr is the depletion of the root zone in mm; 0 is field capacity and TAW is wilting point:
 *   Dr[i] = Dr[i-1] - (P - RO) - I + ETc,adj + DP            (FAO-56 eq. 85)
 * When the root zone deepens, the new soil is assumed as depleted as the old one (uniform
 * depletion), so Dr is rescaled with TAW. Fallow keeps a nominal 1 m profile.
 */
export const BARE_PROFILE_M = 1;
/** Upper limit of the evaporation coefficient of wet bare soil (FAO-56 eq. 72, no wind or height term). */
const KC_MAX_BARE = 1.2;
/** FAO-56 gives p for ETc of about 5 mm/day; p moves by 0.04 per mm/day (Table 22 note), within 0.1 to 0.8. */
const P_REFERENCE_ETC = 5;
const WATER_WEIGHT: readonly number[] = STAGE_SENSITIVITY.water;

/** SCS curve numbers (NEH-4 Table 9-1) for bare fallow soil and for well-covered small grain, by soil group. */
function cnBare(group: HydrologicGroup): number {
  switch (group) {
    case "A":
      return 77;
    case "B":
      return 86;
    case "C":
      return 91;
    default:
      return 94;
  }
}
function cnCovered(group: HydrologicGroup): number {
  switch (group) {
    case "A":
      return 63;
    case "B":
      return 75;
    case "C":
      return 83;
    default:
      return 87;
  }
}

export interface WaterState {
  /** Root-zone depletion, mm. */
  dr: number;
  /** Root depth the depletion refers to, m. */
  zr: number;
  /** Depletion of the evaporating top layer, mm (used for bare soil). */
  de: number;
}

/** What covers the soil today. */
export type Surface = { type: "crop"; kc: number; zr: number; p: number } | { type: "bare" };

export interface DayWater {
  precip: number;
  et0: number;
  /** Irrigation in mm. Defaults to 0. */
  irrigation?: number;
}

export interface StepOptions {
  /** Adjust p for the day's ETc (FAO-56 Table 22 note). Default true. */
  adjustDepletionFraction?: boolean;
}

export interface DayFlux {
  /** Potential evapotranspiration: Kc * ET0 for a crop, Ke * ET0 for bare soil. */
  etc: number;
  /** Actual evapotranspiration drawn from the root zone. */
  eta: number;
  /** Water stress coefficient, eta / etc; 1 for bare soil and when there is no demand. */
  ks: number;
  runoff: number;
  deepPercolation: number;
  /** Total available water of the root zone today, mm. */
  taw: number;
}

// Plain comparisons: Math.min and Math.max add NaN and signed-zero handling that the daily loop does not need.
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const atLeast0 = (x: number) => (x > 0 ? x : 0);

/** Initial state: a root zone `fraction` depleted. */
export function initialWaterState(soil: SoilParams, zr: number, fraction = 0.5): WaterState {
  return { dr: fraction * soil.awcMmPerM * zr, zr, de: soil.tewMm };
}

/** Daily SCS runoff in mm. `wetness` is the relative water content of the root zone, 0 dry to 1 wet. */
export function scsRunoff(
  precip: number,
  group: HydrologicGroup,
  cover: number,
  wetness: number,
): number {
  if (precip <= 0) return 0;
  const bare = cnBare(group);
  const cn2 = bare - clamp(cover, 0, 1) * (bare - cnCovered(group));
  const cn1 = (4.2 * cn2) / (10 - 0.058 * cn2);
  const cn3 = (23 * cn2) / (10 + 0.13 * cn2);
  const w = clamp(wetness, 0, 1);
  // Antecedent moisture: dry soil uses CN I, average CN II, wet soil CN III.
  const cn = w < 0.5 ? cn1 + (cn2 - cn1) * (w / 0.5) : cn2 + (cn3 - cn2) * ((w - 0.5) / 0.5);
  const s = 25.4 * (1000 / cn - 10);
  const ia = 0.2 * s;
  return precip > ia ? (precip - ia) ** 2 / (precip - ia + s) : 0;
}

/**
 * Working state and fluxes of one step in a flat array, updated in place so a long timeline
 * allocates nothing per day (boxed number fields were the slowest part of the daily loop). Index
 * with the constants below: the water state `DR`, `ZR`, `DE` is read then updated; the rest are the
 * day's fluxes.
 */
export type StepBuffer = Float64Array;
export const DR = 0;
export const ZR = 1;
export const DE = 2;
export const ETC = 3;
export const ETA = 4;
export const KS = 5;
export const RUNOFF = 6;
export const PERCOLATION = 7;
export const TAW = 8;
/** Input slots of one step, in the same array so the daily loop passes no boxed numbers. */
export const IN_PRECIP = 9;
export const IN_ET0 = 10;
export const IN_IRRIGATION = 11;
/** 1 on a crop day, 0 on a bare day. */
export const IN_CROP = 12;
export const IN_KC = 13;
export const IN_ZR = 14;
export const IN_P = 15;
/** 1 to adjust the depletion fraction for the day's ETc, 0 to use it as given. */
export const IN_ADJUST = 16;

export function newStepBuffer(state: WaterState): StepBuffer {
  const b = new Float64Array(17);
  b[DR] = state.dr;
  b[ZR] = state.zr;
  b[DE] = state.de;
  b[KS] = 1;
  return b;
}

/**
 * One day of the balance on a reusable buffer; `stepWaterBalance` is the same computation with plain
 * objects. The day's inputs are in the buffer's `IN_*` slots: a crop day sets `IN_CROP` to 1 with its
 * Kc, root depth and depletion fraction; a bare day sets it to 0 and the three are ignored.
 */
export function stepInPlace(b: StepBuffer, soil: SoilParams): void {
  const precip = b[IN_PRECIP] as number;
  const et0 = b[IN_ET0] as number;
  const irrigation = b[IN_IRRIGATION] as number;
  const crop = b[IN_CROP] === 1;
  const kc = b[IN_KC] as number;
  const cropZr = b[IN_ZR] as number;
  const pBase = b[IN_P] as number;
  const adjustDepletionFraction = b[IN_ADJUST] === 1;
  const zr = crop ? cropZr : BARE_PROFILE_M;
  const taw = soil.awcMmPerM * zr;
  if (!crop && precip === 0 && irrigation === 0 && b[DE] === soil.tewMm && b[ZR] === zr) {
    // Dry bare day on a dry topsoil: no wetting, no evaporation (Kr = 0), so only the fluxes change.
    const dry = b[DR] as number;
    const etcDry = KC_MAX_BARE * et0;
    b[DR] = dry < 0 ? 0 : dry > taw ? taw : dry;
    b[ETC] = etcDry;
    b[ETA] = 0;
    b[KS] = etcDry > 0 ? 0 : 1;
    b[RUNOFF] = 0;
    b[PERCOLATION] = 0;
    b[TAW] = taw;
    return;
  }
  // The depletion keeps its share of TAW when the root zone changes (uniform depletion).
  let dr0: number;
  if (b[ZR] === zr) {
    const held = b[DR] as number;
    dr0 = held < 0 ? 0 : held > taw ? taw : held;
  } else {
    const oldTaw = soil.awcMmPerM * (b[ZR] as number);
    dr0 = oldTaw > 0 ? clamp(((b[DR] as number) / oldTaw) * taw, 0, taw) : 0;
  }

  let runoff = 0;
  if (precip > 0) {
    const cover = crop ? clamp(kc - 0.15, 0, 1) : 0;
    runoff = scsRunoff(precip, soil.hydrologicGroup, cover, taw > 0 ? 1 - dr0 / taw : 1);
  }
  const infiltration = precip - runoff;

  let etc: number;
  let demand: number;
  let de = b[DE] as number;
  if (crop) {
    etc = kc * et0;
    let p = pBase;
    if (adjustDepletionFraction) {
      p = pBase + 0.04 * (P_REFERENCE_ETC - etc);
      p = p < 0.1 ? 0.1 : p > 0.8 ? 0.8 : p;
    }
    const raw = p * taw;
    let ks = 1;
    if (dr0 > raw && taw > raw) {
      ks = (taw - dr0) / ((1 - p) * taw);
      ks = ks > 0 ? ks : 0;
    }
    demand = ks * etc;
  } else {
    // Wetting first, then evaporation from the wetted topsoil (as in FAO-56 example 38).
    const wettedRaw = de - infiltration - irrigation;
    const wetted = wettedRaw > 0 ? wettedRaw : 0;
    let kr = 1;
    if (wetted > soil.rewMm) {
      kr = (soil.tewMm - wetted) / (soil.tewMm - soil.rewMm);
      kr = kr > 0 ? kr : 0;
    }
    etc = KC_MAX_BARE * et0;
    demand = kr * etc;
    de = wetted + demand;
    de = de < 0 ? 0 : de > soil.tewMm ? soil.tewMm : de;
  }

  const deepPercolation = atLeast0(infiltration + irrigation - demand - dr0);
  let dr = dr0 - infiltration - irrigation + demand + deepPercolation;
  let eta = demand;
  if (dr > taw) {
    // Demand cannot take more water than the root zone holds.
    eta = atLeast0(eta - (dr - taw));
    dr = taw;
  }

  b[DR] = dr;
  b[ZR] = zr;
  b[DE] = de;
  b[ETC] = etc;
  b[ETA] = eta;
  let ratio = 1;
  if (etc > 0) {
    ratio = eta / etc;
    ratio = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  }
  b[KS] = ratio;
  b[RUNOFF] = runoff;
  b[PERCOLATION] = deepPercolation;
  b[TAW] = taw;
}

/** One day of the balance. Pure: returns the new state and the day's fluxes. */
export function stepWaterBalance(
  state: WaterState,
  soil: SoilParams,
  day: DayWater,
  surface: Surface,
  options: StepOptions = {},
): { state: WaterState; flux: DayFlux } {
  const b = newStepBuffer(state);
  const crop = surface.type === "crop";
  b[IN_PRECIP] = day.precip;
  b[IN_ET0] = day.et0;
  b[IN_IRRIGATION] = day.irrigation ?? 0;
  b[IN_CROP] = crop ? 1 : 0;
  b[IN_KC] = crop ? surface.kc : 0;
  b[IN_ZR] = crop ? surface.zr : 0;
  b[IN_P] = crop ? surface.p : 0;
  b[IN_ADJUST] = options.adjustDepletionFraction !== false ? 1 : 0;
  stepInPlace(b, soil);
  return {
    state: { dr: b[DR] as number, zr: b[ZR] as number, de: b[DE] as number },
    flux: {
      etc: b[ETC] as number,
      eta: b[ETA] as number,
      ks: b[KS] as number,
      runoff: b[RUNOFF] as number,
      deepPercolation: b[PERCOLATION] as number,
      taw: b[TAW] as number,
    },
  };
}

export interface CropSegment {
  crop: Crop;
  /** Day number of the sowing day (day 0 of the season). */
  sowingDay: number;
}

export interface TimelineInput {
  /** Day number of the first forcing day. */
  startDay: number;
  precip: ArrayLike<number>;
  et0: ArrayLike<number>;
  irrigation?: ArrayLike<number>;
  soil: SoilParams;
  /** Crop seasons in any order; every day outside them is bare fallow. */
  segments: readonly CropSegment[];
  /** Root zone depletion at the start, as a fraction of TAW. Default 0.5. */
  initialDepletionFraction?: number;
  options?: StepOptions;
  /**
   * Keep the per-day arrays (default true). With false only `runoff` is filled and the other daily
   * arrays are empty; season summaries and the final state are unaffected. Monte Carlo runs use it
   * to avoid allocating about half a megabyte per timeline.
   */
  daily?: boolean;
}

export interface SegmentSummary {
  cropId: string;
  sowingDay: number;
  /** Last simulated day number of the season. */
  endDay: number;
  /** False when the forcing ends before the season does or starts after sowing. */
  complete: boolean;
  etcMm: number;
  etaMm: number;
  /** Seasonal water-stress index: 1 - sum(w ETc,adj) / sum(w ETc), weighted by stage sensitivity. */
  wsi: number;
  /** Days with Ks below 1 and below 0.5. */
  stressDays: number;
  severeStressDays: number;
  runoffMm: number;
  deepPercolationMm: number;
  precipMm: number;
  /** Depletion at the start and end of the season, mm. */
  startDr: number;
  endDr: number;
}

export interface TimelineResult {
  days: number;
  dr: Float64Array;
  ks: Float64Array;
  eta: Float64Array;
  etc: Float64Array;
  runoff: Float64Array;
  deepPercolation: Float64Array;
  /** Stage per day: -1 bare, otherwise 0 to 3. */
  stage: Int8Array;
  segments: SegmentSummary[];
  finalState: WaterState;
}

/** Runs the daily balance over a timeline of crop seasons and fallow. */
export function simulateTimeline(input: TimelineInput): TimelineResult {
  const n = input.precip.length;
  if (input.et0.length !== n || (input.irrigation && input.irrigation.length !== n)) {
    throw new RangeError("precip, et0 and irrigation must have the same length");
  }
  const daily = input.daily !== false;
  const segments = [...input.segments].sort((a, b) => a.sowingDay - b.sowingDay);
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1] as CropSegment;
    const cur = segments[i] as CropSegment;
    if (prev.sowingDay + seasonLength(prev.crop) > cur.sowingDay) {
      throw new RangeError(`Seasons of ${prev.crop.id} and ${cur.crop.id} overlap`);
    }
  }

  const out: TimelineResult = {
    days: n,
    dr: new Float64Array(daily ? n : 0),
    ks: new Float64Array(daily ? n : 0),
    eta: new Float64Array(daily ? n : 0),
    etc: new Float64Array(daily ? n : 0),
    runoff: new Float64Array(n),
    deepPercolation: new Float64Array(daily ? n : 0),
    stage: new Int8Array(daily ? n : 0).fill(-1),
    segments: [],
    finalState: { dr: 0, zr: BARE_PROFILE_M, de: input.soil.tewMm },
  };
  const first = segments[0];
  const startZr =
    first && first.sowingDay <= input.startDay ? rootDepthAt(first.crop, 0) : BARE_PROFILE_M;
  const buffer = newStepBuffer(
    initialWaterState(input.soil, startZr, input.initialDepletionFraction ?? 0.5),
  );
  buffer[IN_ADJUST] = input.options?.adjustDepletionFraction !== false ? 1 : 0;

  type Summary = SegmentSummary & { wEtc: number; wEta: number };
  const summaries = new Map<CropSegment, Summary>();
  let current: Summary | null = null;
  // Running sums of the active season, kept in locals until the season ends.
  let aEtc = 0;
  let aEta = 0;
  let aWEtc = 0;
  let aWEta = 0;
  let aRunoff = 0;
  let aPercolation = 0;
  let aPrecip = 0;
  let aStress = 0;
  let aSevere = 0;
  let aEndDay = 0;
  let aEndDr = 0;
  let pBase = 0;
  let seasonDays = 0;
  let curves: CropCurves | null = null;
  let next = 0;
  let active: CropSegment | null = null;
  for (let i = 0; i < n; i++) {
    const day = input.startDay + i;
    const upcoming = segments[next];
    if (!active && upcoming && day === upcoming.sowingDay) {
      active = upcoming;
      curves = cropCurves(active.crop);
      pBase = active.crop.depletion_fraction.value;
      seasonDays = seasonLength(active.crop);
      current = null;
      next++;
    }
    let d = -1;
    if (active) {
      d = day - active.sowingDay;
      if (d >= seasonDays) {
        if (current) {
          current.etcMm = aEtc;
          current.etaMm = aEta;
          current.wEtc = aWEtc;
          current.wEta = aWEta;
          current.runoffMm = aRunoff;
          current.deepPercolationMm = aPercolation;
          current.precipMm = aPrecip;
          current.stressDays = aStress;
          current.severeStressDays = aSevere;
          current.endDay = aEndDay;
          current.endDr = aEndDr;
        }
        active = null;
        curves = null;
        current = null;
        // The topsoil is dry after harvest.
        buffer[DE] = input.soil.tewMm;
        const again = segments[next];
        if (again && day === again.sowingDay) {
          active = again;
          curves = cropCurves(active.crop);
          pBase = active.crop.depletion_fraction.value;
          seasonDays = seasonLength(active.crop);
          next++;
          d = 0;
        }
      }
    }

    const startDr = buffer[DR] as number;
    const precip = input.precip[i] as number;
    buffer[IN_PRECIP] = precip;
    buffer[IN_ET0] = input.et0[i] as number;
    buffer[IN_IRRIGATION] = input.irrigation === undefined ? 0 : (input.irrigation[i] as number);
    if (curves) {
      buffer[IN_CROP] = 1;
      buffer[IN_KC] = curves.kc[d] as number;
      buffer[IN_ZR] = curves.zr[d] as number;
      buffer[IN_P] = pBase;
    } else {
      buffer[IN_CROP] = 0;
    }
    stepInPlace(buffer, input.soil);
    const eta = buffer[ETA] as number;
    const etc = buffer[ETC] as number;
    const ks = buffer[KS] as number;
    const runoff = buffer[RUNOFF] as number;
    const percolation = buffer[PERCOLATION] as number;
    if (daily) {
      out.dr[i] = buffer[DR] as number;
      out.ks[i] = ks;
      out.eta[i] = eta;
      out.etc[i] = etc;
      out.deepPercolation[i] = percolation;
    }
    out.runoff[i] = runoff;

    if (active && curves) {
      const stage = curves.stage[d] as number;
      if (daily) out.stage[i] = stage;
      if (!current) {
        current = {
          cropId: active.crop.id,
          sowingDay: active.sowingDay,
          endDay: day,
          complete: false,
          etcMm: 0,
          etaMm: 0,
          wsi: 0,
          stressDays: 0,
          severeStressDays: 0,
          runoffMm: 0,
          deepPercolationMm: 0,
          precipMm: 0,
          startDr,
          endDr: 0,
          wEtc: 0,
          wEta: 0,
        };
        summaries.set(active, current);
        aEtc = aEta = aWEtc = aWEta = aRunoff = aPercolation = aPrecip = aStress = aSevere = 0;
      }
      const w = WATER_WEIGHT[stage] as number;
      aEtc += etc;
      aEta += eta;
      aWEtc += w * etc;
      aWEta += w * eta;
      aRunoff += runoff;
      aPercolation += percolation;
      aPrecip += precip;
      if (ks < 1) aStress++;
      if (ks < 0.5) aSevere++;
      aEndDay = day;
      aEndDr = buffer[DR] as number;
    }
  }
  if (current) {
    current.etcMm = aEtc;
    current.etaMm = aEta;
    current.wEtc = aWEtc;
    current.wEta = aWEta;
    current.runoffMm = aRunoff;
    current.deepPercolationMm = aPercolation;
    current.precipMm = aPrecip;
    current.stressDays = aStress;
    current.severeStressDays = aSevere;
    current.endDay = aEndDay;
    current.endDr = aEndDr;
  }

  out.segments = [...summaries].map(([segment, { wEtc, wEta, ...summary }]) => ({
    ...summary,
    wsi: wEtc > 0 ? 1 - wEta / wEtc : 0,
    complete:
      summary.sowingDay >= input.startDay &&
      summary.endDay - summary.sowingDay + 1 === seasonLength(segment.crop),
  }));
  out.finalState = { dr: buffer[DR] as number, zr: buffer[ZR] as number, de: buffer[DE] as number };
  return out;
}
