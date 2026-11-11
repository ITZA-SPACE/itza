import { lowerMedianIndex, quantileSorted } from "./stats";

export interface ResilienceInput {
  /** Rounded season composites in time order. */
  composites: readonly number[];
  severeWaterStress: ArrayLike<number>;
  thermalHit: ArrayLike<number>;
}

export interface ResilienceMetrics {
  median: number;
  p10: number;
  p90: number;
  worst: number;
  severeWaterStressSeasons: number;
  frostHeatHits: number;
  /** Index (into `composites`) of the season that is the median; its contributions are reported. */
  medianSeason: number;
}

const sum = (flags: ArrayLike<number>) => Array.from(flags).reduce((a, b) => a + b, 0);

/** Distribution metrics of one rotation's season scores (TECHNICAL_ARCHITECTURE §6.3). */
export function resilience(input: ResilienceInput): ResilienceMetrics {
  const order = input.composites
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const sorted = order.map((o) => o.value);
  const middle = order[lowerMedianIndex(order.length)] as { value: number; index: number };
  return {
    median: middle.value,
    // With very few seasons the interpolated P10 could pass the (lower) median; keep P10 <= median <= P90.
    p10: Math.min(middle.value, quantileSorted(sorted, 0.1)),
    p90: Math.max(middle.value, quantileSorted(sorted, 0.9)),
    worst: sorted[0] as number,
    severeWaterStressSeasons: sum(input.severeWaterStress),
    frostHeatHits: sum(input.thermalHit),
    medianSeason: middle.index,
  };
}

/** Share of the seasons both rotations replayed in which `scores` beat `baseline` (strictly). */
export function winRate(
  scores: ReadonlyMap<string, number>,
  baseline: ReadonlyMap<string, number>,
): number | null {
  let common = 0;
  let wins = 0;
  for (const [season, value] of scores) {
    const other = baseline.get(season);
    if (other === undefined) continue;
    common++;
    if (value > other) wins++;
  }
  return common > 0 ? wins / common : null;
}

/** Ranking order: higher median first, then higher P10 (the robustness tie-break), then input order. */
export function compareRanking(
  a: { median: number; p10: number; order: number },
  b: { median: number; p10: number; order: number },
): number {
  return b.median - a.median || b.p10 - a.p10 || a.order - b.order;
}
