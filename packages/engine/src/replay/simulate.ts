import type { CropEntry, PestEntry } from "@itza/knowledge";
import {
  type Crop,
  type CropSegment,
  type DailyForcing,
  isCrop,
  type SegmentSummary,
  type SoilParams,
  seasonLength,
  simulateTimeline,
  thermalStress,
} from "../physics";
import { type AgriculturalYear, sowingDayIn } from "./calendar";
import { erosionIndex, slopeFactor, type YearRain } from "./erosion";
import { type DrawParams, NOMINAL } from "./montecarlo";
import { pestPressure, type WeatherRisk } from "./pests";
import { CRITERIA, CRITERIA_COUNT } from "./score";
import {
  canopyCurve,
  groundCoverMonths,
  type MonthSpan,
  monthlyCover,
  nitrogenScore,
  organicMatterScore,
} from "./soilHealth";
import { clamp01 } from "./stats";

/** Seasonal water-stress index above which a season counts as severe water stress. */
export const SEVERE_WSI = 0.3;
/** Weighted frost and heat day index from which a season counts as a frost or heat hit. */
export const THERMAL_HIT_INDEX = 1;
/** Weighted frost and heat days that cut climate fit to 1/e. */
const THERMAL_SCALE = 5;

const K = Object.fromEntries(CRITERIA.map((name, k) => [name, k])) as Record<
  (typeof CRITERIA)[number],
  number
>;

/** What is the same for every rotation of a replay: weather, soil and the replayed years. */
export interface ReplayContext {
  forcing: DailyForcing;
  soil: SoilParams;
  slopeDeg: number;
  pests: readonly PestEntry[];
  /** Usable agricultural years in time order. */
  years: readonly AgriculturalYear[];
  spans: readonly (readonly MonthSpan[])[];
  rain: readonly YearRain[];
  risks: readonly WeatherRisk[];
}

export interface RotationPlan {
  id: string;
  seasons: readonly { entry: CropEntry; sowingDoy?: number }[];
}

interface PlannedSeason {
  /** Index into `ReplayContext.years`. */
  yearIndex: number;
  entry: CropEntry;
  crop: Crop | null;
  /** Nominal sowing day number; 0 for fallow. */
  sowingDay: number;
  /** Criteria that do not change with the Monte Carlo parameters. */
  fixed: { nitrogen: number; organic: number; pest: number; forage: number };
}

export interface PlannedRotation {
  id: string;
  seasons: PlannedSeason[];
  /** Whole days the sowing dates may move without leaving the weather record. */
  shiftRange: [number, number];
}

/** Per-season facts of a nominal run that the resilience profile needs besides the criteria. */
export interface SeasonFlags {
  severeWaterStress: Uint8Array;
  thermalHit: Uint8Array;
}

function describe(plan: RotationPlan): string {
  return `rotation ${plan.id}`;
}

/**
 * Lays a rotation over the usable years: the season of the n-th usable year uses position n mod N,
 * so the rotation repeats through the record. Seasons whose crop would run past the weather record
 * (including the largest Monte Carlo shift) are left out.
 */
export function planRotation(ctx: ReplayContext, plan: RotationPlan): PlannedRotation {
  const { forcing, years } = ctx;
  const n = plan.seasons.length;
  const entries = plan.seasons.map((s) => s.entry);
  const end = forcing.startDay + forcing.days;
  const seasons: PlannedSeason[] = [];
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  years.forEach((year, u) => {
    const position = u % n;
    const { entry, sowingDoy } = plan.seasons[position] as RotationPlan["seasons"][number];
    const previous = entries[(position - 1 + n) % n] as CropEntry;
    const fixed = {
      nitrogen: nitrogenScore(previous.n_credit_kg_ha.value),
      organic: organicMatterScore(entry),
      pest: 1 - pestPressure(ctx.pests, entries, position, ctx.risks[u] as WeatherRisk),
      forage: 0.5 * clamp01(entry.forage_value.value) + 0.5 * (entry.market_flag.value ? 1 : 0),
    };
    if (!isCrop(entry)) {
      seasons.push({ yearIndex: u, entry, crop: null, sowingDay: 0, fixed });
      return;
    }
    const sowingDay = sowingDayIn(entry, year, sowingDoy);
    const harvestDay = sowingDay + seasonLength(entry);
    if (sowingDay < forcing.startDay || harvestDay > end) return;
    lo = Math.max(lo, forcing.startDay - sowingDay);
    hi = Math.min(hi, end - harvestDay);
    seasons.push({ yearIndex: u, entry, crop: entry, sowingDay, fixed });
  });
  const crops = seasons.filter((s) => s.crop);
  for (let i = 1; i < crops.length; i++) {
    const before = crops[i - 1] as PlannedSeason;
    const after = crops[i] as PlannedSeason;
    if (before.sowingDay + seasonLength(before.crop as Crop) > after.sowingDay) {
      throw new RangeError(
        `Seasons of ${before.entry.id} and ${after.entry.id} overlap in ${describe(plan)}`,
      );
    }
  }
  if (seasons.length === 0)
    throw new RangeError(`${describe(plan)} has no season inside the weather record`);
  return {
    id: plan.id,
    seasons,
    shiftRange: [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 0],
  };
}

/** What one Monte Carlo draw changes about a crop, computed once and shared by every rotation. */
export class DrawCache {
  private readonly variants = new Map<Crop, Crop>();
  private readonly canopies = new Map<Crop, Float64Array>();

  constructor(readonly params: DrawParams) {}

  /** The crop with Kc and depletion fraction moved by the draw. */
  variant(crop: Crop): Crop {
    const { params } = this;
    if (params === NOMINAL) return crop;
    let v = this.variants.get(crop);
    if (!v) {
      const scale = (x: { value: number }) => ({ ...x, value: x.value * params.kcFactor });
      v = {
        ...crop,
        kc_ini: scale(crop.kc_ini) as Crop["kc_ini"],
        kc_mid: scale(crop.kc_mid) as Crop["kc_mid"],
        kc_end: scale(crop.kc_end) as Crop["kc_end"],
        depletion_fraction: {
          ...crop.depletion_fraction,
          value: Math.min(
            0.8,
            Math.max(0.1, crop.depletion_fraction.value + params.depletionShift),
          ),
        },
      };
      this.variants.set(crop, v);
    }
    return v;
  }

  canopy(crop: Crop): Float64Array {
    let curve = this.canopies.get(crop);
    if (!curve) {
      curve = canopyCurve(crop, this.params.kcFactor);
      this.canopies.set(crop, curve);
    }
    return curve;
  }
}

/** Caches shared by every rotation and draw of one replay. */
export class ReplayCache {
  private readonly thermal = new Map<Crop, Map<number, number>>();
  private readonly draws = new Map<DrawParams, DrawCache>();

  /** Weighted frost plus heat day index of a crop sown on `sowingDay` (same for every rotation). */
  thermalIndex(ctx: ReplayContext, crop: Crop, sowingDay: number): number {
    let byDay = this.thermal.get(crop);
    if (!byDay) {
      byDay = new Map();
      this.thermal.set(crop, byDay);
    }
    let value = byDay.get(sowingDay);
    if (value === undefined) {
      const { forcing } = ctx;
      const t = thermalStress(crop, sowingDay - forcing.startDay, forcing.tmax, forcing.tmin);
      value = t.frostIndex + t.heatIndex;
      byDay.set(sowingDay, value);
    }
    return value;
  }

  draw(params: DrawParams): DrawCache {
    let cache = this.draws.get(params);
    if (!cache) {
      cache = new DrawCache(params);
      this.draws.set(params, cache);
    }
    return cache;
  }
}

/**
 * Runs one rotation under one parameter draw and writes the criteria of each planned season into
 * `out` (eight values per season, in `CRITERIA` order). Pure given the cache.
 */
export function runRotation(
  ctx: ReplayContext,
  planned: PlannedRotation,
  params: DrawParams,
  cache: ReplayCache,
  out: Float64Array,
  flags?: SeasonFlags,
): void {
  const { forcing } = ctx;
  const draw = cache.draw(params);
  const shift = Math.min(
    planned.shiftRange[1],
    Math.max(planned.shiftRange[0], params.sowingShiftDays),
  );
  const soil: SoilParams = { ...ctx.soil, awcMmPerM: ctx.soil.awcMmPerM * params.tawFactor };
  const segments: CropSegment[] = [];
  for (const s of planned.seasons) {
    if (s.crop) segments.push({ crop: draw.variant(s.crop), sowingDay: s.sowingDay + shift });
  }
  const timeline = simulateTimeline({
    startDay: forcing.startDay,
    precip: forcing.precip,
    et0: forcing.et0,
    soil,
    segments,
    daily: false,
  });

  const cover = new Float64Array(12);
  let cropIndex = 0;
  planned.seasons.forEach((s, j) => {
    const base = j * CRITERIA_COUNT;
    const year = ctx.years[s.yearIndex] as AgriculturalYear;
    const spans = ctx.spans[s.yearIndex] as readonly MonthSpan[];
    let climateFit = 1;
    let water: number;
    if (s.crop) {
      const summary = timeline.segments[cropIndex++] as SegmentSummary;
      const sowingDay = s.sowingDay + shift;
      const thermal = cache.thermalIndex(ctx, s.crop, sowingDay);
      climateFit = Math.exp(-thermal / THERMAL_SCALE);
      water = 1 - clamp01(summary.wsi);
      monthlyCover(s.entry, sowingDay, spans, draw.canopy(s.crop), cover);
      if (flags) {
        flags.severeWaterStress[j] = summary.wsi > SEVERE_WSI ? 1 : 0;
        flags.thermalHit[j] = thermal >= THERMAL_HIT_INDEX ? 1 : 0;
      }
    } else {
      // Fallow: the share of the year's rain that soaks in instead of running off.
      let rain = 0;
      let runoff = 0;
      for (let day = year.startDay; day < year.endDay; day++) {
        const i = day - forcing.startDay;
        rain += forcing.precip[i] as number;
        runoff += timeline.runoff[i] as number;
      }
      water = rain > 1 ? 1 - clamp01(runoff / rain) : 1;
      monthlyCover(s.entry, 0, spans, null, cover);
      if (flags) {
        flags.severeWaterStress[j] = 0;
        flags.thermalHit[j] = 0;
      }
    }
    const erosion = erosionIndex(
      slopeFactor(ctx.slopeDeg),
      ctx.rain[s.yearIndex] as YearRain,
      cover,
    );
    out[base + K.climate_fit] = climateFit;
    out[base + K.water_balance] = water;
    out[base + K.soil_nitrogen] = s.fixed.nitrogen;
    out[base + K.organic_matter] = s.fixed.organic;
    out[base + K.erosion_control] = 1 - clamp01(erosion);
    out[base + K.bare_exposure] = groundCoverMonths(cover) / cover.length;
    out[base + K.pest_pressure] = s.fixed.pest;
    out[base + K.forage_income] = s.fixed.forage;
  });
}
