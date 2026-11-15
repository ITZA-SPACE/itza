import type { FutureResult } from "@itza/engine/worker";

export interface RotationRef {
  id: string;
  name: string;
  isBaseline: boolean;
}

/** A rotation's 2050 outlook under one scenario, in units a farmer reads: a score out of 100 and %. */
export interface RotationOutlook extends RotationRef {
  /** Index in the comparison's order, used for a stable colour. */
  index: number;
  /** History replay score, 0 to 100. */
  today: number;
  /** Median-model 2050 score, 0 to 100 (equal to `today` for the Today view). */
  future: number;
  rankToday: number;
  rankFuture: number;
  /** Score change as % of today's score: median model, and the range over the model spread. */
  change: { median: number; min: number; max: number };
  /** Change in seasons with severe water stress (median model). */
  drought: number;
}

const pct = (delta: number, base: number) => (base > 0 ? (delta / base) * 100 : 0);

/** Standard competition ranking (1, 1, 3): equal scores share a rank. */
function ranks(values: readonly number[]): number[] {
  return values.map((v) => 1 + values.filter((other) => other > v).length);
}

/**
 * Outlook per rotation for a scenario (`null` for Today). Scores and ranks use whole points out of 100,
 * the same rounding the farmer sees, so ties on screen are ties in rank.
 */
export function outlook(
  future: FutureResult,
  rotations: readonly RotationRef[],
  ssp: string | null,
): RotationOutlook[] {
  const shifts = new Map(
    (future.ssps.find((s) => s.ssp === ssp) ?? future.ssps[0])?.rotations.map((r) => [
      r.rotation_id,
      r,
    ]) ?? [],
  );
  const rows = rotations.flatMap((rotation, index) => {
    const shift = shifts.get(rotation.id);
    if (!shift) return [];
    const base = shift.history.score;
    const today = Math.round(base * 100);
    const live = ssp !== null;
    return [
      {
        ...rotation,
        index,
        today,
        future: live ? Math.round((base + shift.score.median) * 100) : today,
        change: live
          ? {
              median: pct(shift.score.median, base),
              min: pct(shift.score.min, base),
              max: pct(shift.score.max, base),
            }
          : { median: 0, min: 0, max: 0 },
        drought: live ? shift.severe_water_stress_seasons : 0,
      },
    ];
  });
  const todayRanks = ranks(rows.map((r) => r.today));
  const futureRanks = ranks(rows.map((r) => r.future));
  return rows.map((r, i) => ({
    ...r,
    rankToday: todayRanks[i] ?? 0,
    rankFuture: futureRanks[i] ?? 0,
  }));
}

export interface Headline {
  best: RotationOutlook | null;
  /** The best rotation is (joint) first under every scenario in the payload. */
  bestEverywhere: boolean;
  largestLoss: RotationOutlook | null;
  rankMoves: number;
  /** Mean season temperature change, degrees C, against the observed seasons. */
  warmingC: number | null;
  /** Total rain change, % of the observed seasons' rain. */
  rainPct: number | null;
}

export function headline(
  future: FutureResult,
  rotations: readonly RotationRef[],
  ssp: string | null,
): Headline {
  const rows = outlook(future, rotations, ssp);
  const best = rows.filter((r) => r.rankFuture === 1).sort((a, b) => a.index - b.index)[0] ?? null;
  const bestEverywhere =
    best !== null &&
    future.ssps.every(
      (s) => outlook(future, rotations, s.ssp).find((r) => r.id === best.id)?.rankFuture === 1,
    );
  const losers = rows.filter((r) => r.change.median < 0);
  const largestLoss = losers.sort((a, b) => a.change.median - b.change.median)[0] ?? null;
  const today = future.climate.find((row) => row.id === "today");
  const scenario = ssp ? future.climate.find((row) => row.id === ssp) : undefined;
  let warmingC: number | null = null;
  let rainPct: number | null = null;
  if (
    today &&
    scenario &&
    today.seasons.length === scenario.seasons.length &&
    today.seasons.length
  ) {
    const n = today.seasons.length;
    warmingC =
      scenario.seasons.reduce(
        (sum, s, i) => sum + s.meanTempC - (today.seasons[i]?.meanTempC ?? 0),
        0,
      ) / n;
    const rainToday = today.seasons.reduce((sum, s) => sum + s.rainMm, 0);
    const rainFuture = scenario.seasons.reduce((sum, s) => sum + s.rainMm, 0);
    rainPct = pct(rainFuture - rainToday, rainToday);
  }
  return {
    best,
    bestEverywhere,
    largestLoss,
    rankMoves: rows.filter((r) => r.rankFuture !== r.rankToday).length,
    warmingC,
    rainPct,
  };
}

/** A % change with a real minus sign and no false precision: `−5%`, `+2%`, `0%`. */
export function percent(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

/** Below this change in score (% of today), the change is reported as "little change". */
export const MATERIAL_PCT = 3.5;

export function direction(value: number): "up" | "down" | "flat" {
  if (value >= MATERIAL_PCT) return "up";
  if (value <= -MATERIAL_PCT) return "down";
  return "flat";
}

/** The categorical palette token for a rotation, stable across charts and the table. */
export function rotationColor(index: number): string {
  return `var(--color-cat-${(index % 8) + 1})`;
}
