import type { CropEntry } from "@itza/knowledge";
import type { Constraints } from "../contracts";
import { type Crop, isCrop, seasonLength } from "../physics";
import type { ReplayContext } from "../replay";
import { sowingDayIn } from "../replay";

export type FilterId =
  | "excluded_by_user"
  | "market_access"
  | "irrigation"
  | "livestock"
  | "equipment"
  | "frost_free_days"
  | "temperature_range";

export interface CropExclusion {
  crop: string;
  filter: FilterId | "pest_break" | "not_selected";
  reason: string;
}

/**
 * Equipment limits the engine knows how to apply. The packs carry no machinery traits, so a limit is
 * a rule on crop ids (a team estimate, like the pack's low-confidence values); limits that are not
 * listed here are not checked and are reported as information gaps.
 */
const ROW_CROPS = /sunflower|maize|corn|sorghum|potato|sugar_?beet|cotton/;
export const EQUIPMENT_LIMITS: Readonly<
  Record<string, { label: string; blocks: (crop: CropEntry) => boolean }>
> = {
  no_row_crop_planter: {
    label: "no row-crop planter",
    blocks: (crop) => ROW_CROPS.test(crop.id),
  },
};

/** A crop that is grown only for livestock: no market and mostly forage value. */
export function isForageOnly(crop: CropEntry): boolean {
  return crop.kind === "crop" && !crop.market_flag.value && crop.forage_value.value >= 0.5;
}

const FROST_TENDER_C = -2;

/** Crop-level rule hits from the farmer's hard constraints (no weather needed). */
export function constraintHit(crop: CropEntry, constraints: Constraints): CropExclusion | null {
  const hit = (filter: FilterId, reason: string): CropExclusion => ({
    crop: crop.id,
    filter,
    reason,
  });
  if (constraints.excluded_crops?.includes(crop.id)) {
    return hit("excluded_by_user", `You excluded ${crop.name}.`);
  }
  if (constraints.market_access?.[crop.id] === false) {
    return hit("market_access", `You have no market for ${crop.name}.`);
  }
  if (isCrop(crop) && crop.requires_irrigation && constraints.irrigation.level === "none") {
    return hit("irrigation", `${crop.name} needs irrigation and you have none.`);
  }
  if (!constraints.livestock && isForageOnly(crop)) {
    return hit("livestock", `${crop.name} is grown for livestock and you have none.`);
  }
  for (const limit of constraints.equipment_limits ?? []) {
    const rule = EQUIPMENT_LIMITS[limit];
    if (rule?.blocks(crop)) {
      return hit("equipment", `${crop.name} needs equipment you lack (${rule.label}).`);
    }
  }
  return null;
}

/** Equipment limits the engine cannot apply, for the information-gap list. */
export function unknownEquipmentLimits(constraints: Constraints): string[] {
  return (constraints.equipment_limits ?? []).filter((limit) => !(limit in EQUIPMENT_LIMITS));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] as number;
}

/**
 * Longest run of days without frost (Tmin above 0 C) in each full year of the record, as a median.
 * Years run January to December in the northern hemisphere and July to June in the southern one, so
 * the growing season is not cut in two. Null when no full year exists.
 */
export function frostFreeDays(ctx: ReplayContext, latitudeDeg: number): number | null {
  const { forcing } = ctx;
  const startMonth = latitudeDeg >= 0 ? 1 : 7;
  const runs: number[] = [];
  let year = -1;
  let run = 0;
  let best = 0;
  let days = 0;
  const flush = () => {
    if (days >= 360) runs.push(best);
    run = 0;
    best = 0;
    days = 0;
  };
  for (let i = 0; i < forcing.days; i++) {
    const date = new Date((forcing.startDay + i) * 86_400_000);
    const month = date.getUTCMonth() + 1;
    const y = month >= startMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
    if (y !== year) {
      flush();
      year = y;
    }
    days++;
    run = (forcing.tmin[i] as number) > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // The last year only counts when it is complete, which `flush` checks by its day count.
  flush();
  return median(runs);
}

/** Mean temperature of the crop's season at its default sowing, median over the usable years. */
export function seasonMeanTemperature(ctx: ReplayContext, crop: Crop): number | null {
  const { forcing } = ctx;
  const end = forcing.startDay + forcing.days;
  const means: number[] = [];
  for (const year of ctx.years) {
    const sowing = sowingDayIn(crop, year);
    const harvest = sowing + seasonLength(crop);
    if (sowing < forcing.startDay || harvest > end) continue;
    let sum = 0;
    for (let day = sowing; day < harvest; day++) {
      const i = day - forcing.startDay;
      sum += ((forcing.tmax[i] as number) + (forcing.tmin[i] as number)) / 2;
    }
    means.push(sum / (harvest - sowing));
  }
  return median(means);
}

export interface ClimateFacts {
  frostFreeDays: number | null;
  /** Season mean temperature per crop id, for crops that have a season. */
  seasonMeanC: ReadonlyMap<string, number | null>;
}

export function climateFacts(
  ctx: ReplayContext,
  crops: readonly CropEntry[],
  latitudeDeg: number,
): ClimateFacts {
  const seasonMeanC = new Map<string, number | null>();
  for (const crop of crops)
    if (isCrop(crop)) seasonMeanC.set(crop.id, seasonMeanTemperature(ctx, crop));
  return { frostFreeDays: frostFreeDays(ctx, latitudeDeg), seasonMeanC };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Crop-level climate rule hits: frost-free days for tender crops, and the temperature range. */
export function climateHit(crop: CropEntry, facts: ClimateFacts): CropExclusion | null {
  if (!isCrop(crop)) return null;
  const hit = (filter: FilterId, reason: string): CropExclusion => ({
    crop: crop.id,
    filter,
    reason,
  });
  const tender = crop.frost_threshold_c.ini.value >= FROST_TENDER_C;
  const length = seasonLength(crop);
  if (tender && facts.frostFreeDays !== null && length > facts.frostFreeDays) {
    return hit(
      "frost_free_days",
      `${crop.name} needs ${length} frost-free days and its young plants are frost-tender; the longest frost-free stretch is about ${facts.frostFreeDays} days in a typical year.`,
    );
  }
  const mean = facts.seasonMeanC.get(crop.id);
  if (mean !== undefined && mean !== null) {
    if (mean < crop.t_base_c.value) {
      return hit(
        "temperature_range",
        `${crop.name} would grow at a mean of ${round1(mean)} C, below its base temperature of ${crop.t_base_c.value} C.`,
      );
    }
    if (mean > crop.t_max_c.value) {
      return hit(
        "temperature_range",
        `${crop.name} would grow at a mean of ${round1(mean)} C, above its upper limit of ${crop.t_max_c.value} C.`,
      );
    }
  }
  return null;
}
