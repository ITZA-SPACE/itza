import { type Crop, kcAt, rootDepthAt, STAGE_SENSITIVITY, seasonLength, stageAt } from "./crops";
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

/** SCS curve numbers (NEH-4 Table 9-1) for bare fallow soil and for well-covered small grain, by soil group. */
const CN_BARE: Record<HydrologicGroup, number> = { A: 77, B: 86, C: 91, D: 94 };
const CN_COVERED: Record<HydrologicGroup, number> = { A: 63, B: 75, C: 83, D: 87 };

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

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

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
  const cn2 = CN_BARE[group] - clamp(cover, 0, 1) * (CN_BARE[group] - CN_COVERED[group]);
  const cn1 = (4.2 * cn2) / (10 - 0.058 * cn2);
  const cn3 = (23 * cn2) / (10 + 0.13 * cn2);
  const w = clamp(wetness, 0, 1);
  // Antecedent moisture: dry soil uses CN I, average CN II, wet soil CN III.
  const cn = w < 0.5 ? cn1 + (cn2 - cn1) * (w / 0.5) : cn2 + (cn3 - cn2) * ((w - 0.5) / 0.5);
  const s = 25.4 * (1000 / cn - 10);
  const ia = 0.2 * s;
  return precip > ia ? (precip - ia) ** 2 / (precip - ia + s) : 0;
}

/** One day of the balance. Pure: returns the new state and the day's fluxes. */
export function stepWaterBalance(
  state: WaterState,
  soil: SoilParams,
  day: DayWater,
  surface: Surface,
  options: StepOptions = {},
): { state: WaterState; flux: DayFlux } {
  const irrigation = day.irrigation ?? 0;
  const zr = surface.type === "crop" ? surface.zr : BARE_PROFILE_M;
  const taw = soil.awcMmPerM * zr;
  const oldTaw = soil.awcMmPerM * state.zr;
  const dr0 = oldTaw > 0 ? clamp((state.dr / oldTaw) * taw, 0, taw) : 0;

  const cover = surface.type === "crop" ? clamp(surface.kc - 0.15, 0, 1) : 0;
  const wetness = taw > 0 ? 1 - dr0 / taw : 1;
  const runoff = scsRunoff(day.precip, soil.hydrologicGroup, cover, wetness);
  const infiltration = day.precip - runoff;

  let etc: number;
  let demand: number;
  let de = state.de;
  if (surface.type === "crop") {
    etc = surface.kc * day.et0;
    const pBase = surface.p;
    const p =
      options.adjustDepletionFraction === false
        ? pBase
        : clamp(pBase + 0.04 * (P_REFERENCE_ETC - etc), 0.1, 0.8);
    const raw = p * taw;
    const ks = dr0 > raw && taw > raw ? Math.max(0, (taw - dr0) / ((1 - p) * taw)) : 1;
    demand = ks * etc;
  } else {
    // Wetting first, then evaporation from the wetted topsoil (as in FAO-56 example 38).
    const wetted = Math.max(0, de - infiltration - irrigation);
    const kr =
      wetted <= soil.rewMm ? 1 : Math.max(0, (soil.tewMm - wetted) / (soil.tewMm - soil.rewMm));
    etc = KC_MAX_BARE * day.et0;
    demand = kr * etc;
    de = clamp(wetted + demand, 0, soil.tewMm);
  }

  const deepPercolation = Math.max(infiltration + irrigation - demand - dr0, 0);
  let dr = dr0 - infiltration - irrigation + demand + deepPercolation;
  let eta = demand;
  if (dr > taw) {
    // Demand cannot take more water than the root zone holds.
    eta = Math.max(0, eta - (dr - taw));
    dr = taw;
  }

  return {
    state: { dr, zr, de },
    flux: {
      etc,
      eta,
      ks: etc > 0 ? clamp(eta / etc, 0, 1) : 1,
      runoff,
      deepPercolation,
      taw,
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
    dr: new Float64Array(n),
    ks: new Float64Array(n),
    eta: new Float64Array(n),
    etc: new Float64Array(n),
    runoff: new Float64Array(n),
    deepPercolation: new Float64Array(n),
    stage: new Int8Array(n).fill(-1),
    segments: [],
    finalState: { dr: 0, zr: BARE_PROFILE_M, de: input.soil.tewMm },
  };
  const first = segments[0];
  const startZr =
    first && first.sowingDay <= input.startDay ? rootDepthAt(first.crop, 0) : BARE_PROFILE_M;
  let state = initialWaterState(input.soil, startZr, input.initialDepletionFraction ?? 0.5);

  const summaries = new Map<CropSegment, SegmentSummary & { wEtc: number; wEta: number }>();
  let next = 0;
  let active: CropSegment | null = null;
  for (let i = 0; i < n; i++) {
    const day = input.startDay + i;
    const upcoming = segments[next];
    if (!active && upcoming && day === upcoming.sowingDay) {
      active = upcoming;
      next++;
    }
    let surface: Surface = { type: "bare" };
    let d = -1;
    if (active) {
      d = day - active.sowingDay;
      if (d >= seasonLength(active.crop)) {
        active = null;
        // The topsoil is dry after harvest.
        state = { ...state, de: input.soil.tewMm };
        const again = segments[next];
        if (again && day === again.sowingDay) {
          active = again;
          next++;
          d = 0;
        }
      }
    }
    if (active) {
      surface = {
        type: "crop",
        kc: kcAt(active.crop, d),
        zr: rootDepthAt(active.crop, d),
        p: active.crop.depletion_fraction.value,
      };
    }

    const startDr = state.dr;
    const water: DayWater =
      input.irrigation === undefined
        ? { precip: input.precip[i] as number, et0: input.et0[i] as number }
        : {
            precip: input.precip[i] as number,
            et0: input.et0[i] as number,
            irrigation: input.irrigation[i] as number,
          };
    const step = stepWaterBalance(state, input.soil, water, surface, input.options);
    state = step.state;
    out.dr[i] = state.dr;
    out.ks[i] = step.flux.ks;
    out.eta[i] = step.flux.eta;
    out.etc[i] = step.flux.etc;
    out.runoff[i] = step.flux.runoff;
    out.deepPercolation[i] = step.flux.deepPercolation;

    if (active) {
      const stage = stageAt(active.crop, d) ?? 3;
      out.stage[i] = stage;
      let s = summaries.get(active);
      if (!s) {
        s = {
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
          endDr: state.dr,
          wEtc: 0,
          wEta: 0,
        };
        summaries.set(active, s);
      }
      const w = STAGE_SENSITIVITY.water[stage];
      s.endDay = day;
      s.etcMm += step.flux.etc;
      s.etaMm += step.flux.eta;
      s.wEtc += w * step.flux.etc;
      s.wEta += w * step.flux.eta;
      s.runoffMm += step.flux.runoff;
      s.deepPercolationMm += step.flux.deepPercolation;
      s.precipMm += water.precip;
      s.endDr = state.dr;
      if (step.flux.ks < 1) s.stressDays++;
      if (step.flux.ks < 0.5) s.severeStressDays++;
    }
  }

  out.segments = [...summaries].map(([segment, { wEtc, wEta, ...summary }]) => ({
    ...summary,
    wsi: wEtc > 0 ? 1 - wEta / wEtc : 0,
    complete:
      summary.sowingDay >= input.startDay &&
      summary.endDay - summary.sowingDay + 1 === seasonLength(segment.crop),
  }));
  out.finalState = state;
  return out;
}
