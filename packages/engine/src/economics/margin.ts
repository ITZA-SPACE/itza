import type { RotationResult, SeasonResult } from "../contracts";

/** What the user entered for one crop. Nothing is defaulted: every number is the user's own. */
export interface CropEconomics {
  /** Reference yield in tonnes per hectare. */
  yieldTonnesPerHa: number;
  /** Price in currency units per tonne. */
  pricePerTonne: number;
  /** Total cost in currency units per hectare. */
  costPerHa: number;
}

/**
 * Crop id to what the user has typed so far. A crop gets a margin only once all three numbers are
 * set; a partial or missing entry (fallow, cover) has none, so no number is ever made up.
 */
export type EconomicsInput = Readonly<Record<string, Partial<CropEconomics>>>;

const isComplete = (e: Partial<CropEconomics> | undefined): e is CropEconomics =>
  e !== undefined &&
  [e.yieldTonnesPerHa, e.pricePerTonne, e.costPerHa].every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );

export interface SeasonMargin {
  season: string;
  crop: string;
  /** Margin per hectare, or null when the user set no economics for the crop. */
  margin: number | null;
}

export interface RotationMargin {
  rotationId: string;
  seasons: SeasonMargin[];
  /** Mean margin per hectare over seasons that have one, or null when none do. */
  meanMargin: number | null;
  /** Seasons left out because their crop has no economics. */
  missingSeasons: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Yield factor of a replayed season, 0 to 1: the mean of climate fit and water balance, the two
 * criteria that carry weather risk to the crop. A proxy, not a yield model.
 */
export function yieldFactor(season: SeasonResult): number {
  return yieldFactorOf(season.criteria.climate_fit, season.criteria.water_balance);
}

/** The yield factor from the two criteria directly, for callers that hold raw replay criteria. */
export function yieldFactorOf(climateFit: number, waterBalance: number): number {
  return clamp01((climateFit + waterBalance) / 2);
}

/** Margin per hectare: price x reference yield x yield factor - cost. */
export function seasonMargin(
  season: SeasonResult,
  econ: Partial<CropEconomics> | undefined,
): SeasonMargin {
  const margin = isComplete(econ)
    ? econ.pricePerTonne * econ.yieldTonnesPerHa * yieldFactor(season) - econ.costPerHa
    : null;
  return { season: season.season, crop: season.crop, margin };
}

export function rotationMargin(result: RotationResult, input: EconomicsInput): RotationMargin {
  const seasons = result.seasons.map((s) => seasonMargin(s, input[s.crop]));
  const priced = seasons.flatMap((s) => (s.margin === null ? [] : [s.margin]));
  return {
    rotationId: result.rotation_id,
    seasons,
    meanMargin: priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null,
    missingSeasons: seasons.length - priced.length,
  };
}

/** True once the user has set all three numbers for at least one crop. */
export function hasEconomics(input: EconomicsInput): boolean {
  return Object.values(input).some(isComplete);
}

/**
 * Income criterion, 0 to 1, for rotations by mean margin (min-max across the compared rotations;
 * all equal gives 0.5). Rotations without a margin get null so the caller keeps the forage/income
 * criterion. Not yet fed into scoring: that wiring belongs to the compare workspace.
 */
export function incomeCriterion(margins: readonly RotationMargin[]): Map<string, number | null> {
  const values = margins.flatMap((m) => (m.meanMargin === null ? [] : [m.meanMargin]));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return new Map(
    margins.map((m) => [
      m.rotationId,
      m.meanMargin === null ? null : hi === lo ? 0.5 : (m.meanMargin - lo) / (hi - lo),
    ]),
  );
}
