import type { CanonicalSeries, Confidence, Period, Provenance } from "../contracts";

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Every source id behind a series: its own source plus each switch listed in `segments`. */
export function seriesSources(series: CanonicalSeries): string[] {
  return [series.provenance.source, ...(series.segments ?? []).map((s) => s.source)];
}

/**
 * Provenance of a value the engine derived from input series (C-2): the coarsest resolution, the
 * lowest quality and every input source in `derived_from`.
 */
export function derivedProvenance(
  inputs: readonly CanonicalSeries[],
  product: string,
  period: Period,
  method: string,
): Provenance {
  const sources = [...new Set(inputs.flatMap(seriesSources))].sort();
  const quality = inputs.reduce<Confidence>(
    (worst, s) => (RANK[s.provenance.quality] < RANK[worst] ? s.provenance.quality : worst),
    "high",
  );
  return {
    source: "itza_engine",
    product,
    version: "1.0",
    resolution_m: Math.max(0, ...inputs.map((s) => s.provenance.resolution_m)),
    period,
    quality,
    derived_from: sources,
    method,
  };
}
