import type { CropEntry } from "@itza/knowledge";
import type { Constraints, Rotation } from "../contracts";
import { yieldFactorOf } from "../economics";
import {
  type Crop,
  type CropSegment,
  isCrop,
  type SegmentSummary,
  seasonLength,
  simulateTimeline,
} from "../physics";
import {
  CRITERIA,
  CRITERIA_COUNT,
  canopyCurve,
  groundCoverMonths,
  type MonthSpan,
  monthlyCover,
  NOMINAL,
  type PlannedRotation,
  pestPressure,
  planOf,
  planRotation,
  ReplayCache,
  type ReplayWorld,
  runRotation,
  type WeatherRisk,
} from "../replay";
import { pestBreakViolations } from "./candidates";
import { climateFacts, climateHit, constraintHit } from "./constraints";

/** Whether a crop is sown in the cool season or the warm one; null for fallow and cover. */
export type SowingSeason = "winter" | "summer";

/** A crop the farmer can drag onto the timeline. */
export interface PaletteCrop {
  id: string;
  name: string;
  kind: CropEntry["kind"];
  /** Crop family, for the color of the chip; fallow has none. */
  family: string | null;
  sowing: SowingSeason | null;
  seasonDays: number | null;
}

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const doyOf = (monthDay: string): number => {
  const [m, d] = monthDay.split("-").map(Number) as [number, number];
  return (DAYS_BEFORE_MONTH[m - 1] as number) + d;
};
const circularGap = (a: number, b: number): number => {
  const gap = Math.abs(a - b) % 365;
  return Math.min(gap, 365 - gap);
};
const windowMid = (w: { start: string; end: string }): number => {
  const from = doyOf(w.start);
  const to = doyOf(w.end);
  return (to >= from ? (from + to) / 2 : (from + to + 365) / 2) % 365;
};

/**
 * The pack's crops as a palette. A crop is winter-sown when its sowing window is nearer the pack's
 * autumn window than its spring one.
 */
export function palette(pack: ReplayWorld["pack"]): PaletteCrop[] {
  const autumn = windowMid(pack.calendar.sowing_windows.autumn);
  const spring = windowMid(pack.calendar.sowing_windows.spring);
  return pack.crops.map((entry) => {
    const sown = isCrop(entry);
    const mid = sown ? windowMid(entry.sowing_window) : 0;
    return {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      family: entry.kind === "fallow" ? null : entry.family,
      sowing: sown
        ? circularGap(mid, autumn) <= circularGap(mid, spring)
          ? "winter"
          : "summer"
        : null,
      seasonDays: sown ? seasonLength(entry) : null,
    };
  });
}

/** One position of the design with what the replay found there, averaged over the replayed years. */
export interface DesignSeason {
  position: number;
  crop: string;
  name: string;
  /** Days with some water stress (Ks below 1) in the crop season; 0 for fallow. */
  waterStressDays: number;
  /** Days with severe water stress (Ks below 0.5). */
  severeStressDays: number;
  /** Nitrogen the previous crop leaves for this season, kg N/ha; negative when it draws the soil down. */
  nitrogenKgHa: number;
  /** Months of the agricultural year the soil is covered. */
  coverMonths: number;
  /** Pest pressure 0 to 1, with the weather of each replayed year. */
  pestPressure: number;
  /**
   * Yield factor 0 to 1 of the replay (mean of climate fit and water balance), the same proxy the
   * economics layer turns into a margin; 0 for fallow, which grows nothing.
   */
  yieldFactor: number;
  /** Replayed years that had this position. */
  years: number;
}

export type DesignWarningKind = "pest_break" | "climate" | "constraint" | "overlap" | "record";

export interface DesignWarning {
  kind: DesignWarningKind;
  message: string;
  /** Timeline positions the warning is about; empty when it concerns the design as a whole. */
  positions: number[];
}

export interface DesignReport {
  /** One entry per position; empty when the crops cannot be laid out (see warnings). */
  seasons: DesignSeason[];
  warnings: DesignWarning[];
  /** Replayed seasons the averages come from. */
  replayedSeasons: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function positionsOf(sequence: readonly CropEntry[], crop: CropEntry): number[] {
  return sequence.flatMap((c, i) => (c.id === crop.id ? [i] : []));
}

function ruleWarnings(
  world: ReplayWorld,
  entries: readonly CropEntry[],
  latitude: number,
  constraints: Constraints,
): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  for (const hit of pestBreakViolations(world.ctx.pests, entries)) {
    const need = hit.pest.min_break_years.value;
    const name = hit.crop.name;
    warnings.push({
      kind: "pest_break",
      positions: positionsOf(entries, hit.crop),
      message:
        hit.breakSeasons === 0
          ? `${name} after ${name}: ${hit.pest.name} risk. It needs ${need} season${need === 1 ? "" : "s"} away from the crop.`
          : `${name} returns after ${hit.breakSeasons} season${hit.breakSeasons === 1 ? "" : "s"}: ${hit.pest.name} needs ${need} away.`,
    });
  }
  const distinct = [...new Map(entries.map((e) => [e.id, e])).values()];
  const facts = climateFacts(world.ctx, distinct, latitude);
  for (const crop of distinct) {
    const hit = climateHit(crop, facts) ?? constraintHit(crop, constraints);
    if (!hit) continue;
    warnings.push({
      kind:
        hit.filter === "frost_free_days" || hit.filter === "temperature_range"
          ? "climate"
          : "constraint",
      positions: positionsOf(entries, crop),
      message: hit.reason,
    });
  }
  return warnings;
}

/**
 * What a hand-built rotation does on this field, without Monte Carlo: the nominal replay of every
 * season of the record, averaged per timeline position. Cheap enough to run after every drag.
 */
export function designReport(input: {
  world: ReplayWorld;
  rotation: Rotation;
  constraints: Constraints;
  latitude: number;
}): DesignReport {
  const { world, rotation, constraints, latitude } = input;
  const { ctx, pack } = world;
  const plan = planOf(pack, rotation, "design");
  const entries = plan.seasons.map((s) => s.entry);
  const warnings = ruleWarnings(world, entries, latitude, constraints);

  let planned: PlannedRotation;
  try {
    planned = planRotation(ctx, plan);
  } catch (error) {
    const overlap = /overlap/.test((error as Error).message);
    return {
      seasons: [],
      replayedSeasons: 0,
      warnings: [
        ...warnings,
        {
          kind: overlap ? "overlap" : "record",
          positions: [],
          message: (error as Error).message,
        },
      ],
    };
  }

  const segments: CropSegment[] = planned.seasons.flatMap((s) =>
    s.crop ? [{ crop: s.crop, sowingDay: s.sowingDay }] : [],
  );
  const summaries: SegmentSummary[] = simulateTimeline({
    startDay: ctx.forcing.startDay,
    precip: ctx.forcing.precip,
    et0: ctx.forcing.et0,
    soil: ctx.soil,
    segments,
    daily: false,
  }).segments;

  const criteria = new Float64Array(planned.seasons.length * CRITERIA_COUNT);
  runRotation(ctx, planned, NOMINAL, new ReplayCache(), criteria);
  const climateFit = CRITERIA.indexOf("climate_fit");
  const waterBalance = CRITERIA.indexOf("water_balance");

  const n = entries.length;
  const sums = entries.map(() => ({
    stress: 0,
    severe: 0,
    cover: 0,
    pest: 0,
    yield: 0,
    years: 0,
  }));
  const cover = new Float64Array(12);
  let cropIndex = 0;
  for (const [s, season] of planned.seasons.entries()) {
    const position = season.yearIndex % n;
    const sum = sums[position] as (typeof sums)[number];
    const spans = ctx.spans[season.yearIndex] as readonly MonthSpan[];
    if (season.crop) {
      const summary = summaries[cropIndex++] as SegmentSummary;
      sum.stress += summary.stressDays;
      sum.severe += summary.severeStressDays;
      const at = s * CRITERIA_COUNT;
      sum.yield += yieldFactorOf(
        criteria[at + climateFit] as number,
        criteria[at + waterBalance] as number,
      );
      monthlyCover(season.entry, season.sowingDay, spans, canopyCurve(season.crop as Crop), cover);
    } else {
      monthlyCover(season.entry, 0, spans, null, cover);
    }
    sum.cover += groundCoverMonths(cover);
    sum.pest += pestPressure(
      ctx.pests,
      entries,
      position,
      ctx.risks[season.yearIndex] as WeatherRisk,
    );
    sum.years++;
  }

  const seasons = sums.flatMap((sum, position): DesignSeason[] => {
    if (sum.years === 0) return [];
    const entry = entries[position] as CropEntry;
    const previous = entries[(position - 1 + n) % n] as CropEntry;
    return [
      {
        position,
        crop: entry.id,
        name: entry.name,
        waterStressDays: round1(sum.stress / sum.years),
        severeStressDays: round1(sum.severe / sum.years),
        nitrogenKgHa: previous.n_credit_kg_ha.value,
        coverMonths: round1(sum.cover / sum.years),
        pestPressure: round3(sum.pest / sum.years),
        yieldFactor: round3(sum.yield / sum.years),
        years: sum.years,
      },
    ];
  });
  const missing = sums.flatMap((sum, position) => (sum.years === 0 ? [position] : []));
  if (missing.length > 0) {
    warnings.push({
      kind: "record",
      positions: missing,
      message: `The weather record is too short to replay every season of this design (${planned.seasons.length} replayed); the seasons marked are not shown.`,
    });
  }
  return { seasons, warnings, replayedSeasons: planned.seasons.length };
}
