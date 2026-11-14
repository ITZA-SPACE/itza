import type { CanonicalSeries, Gap } from "@itza/engine/contracts";

export type PriorityChains = Record<string, string[]>;

const DAY_MS = 86_400_000;

function toDay(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function rank(chain: string[] | undefined, series: CanonicalSeries): number {
  const index = chain?.indexOf(series.provenance.source) ?? -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function spliceDaily(ordered: CanonicalSeries[]): CanonicalSeries {
  const [top] = ordered;
  if (!top) throw new Error("spliceDaily needs at least one series");
  const starts = ordered.map((s) => toDay(s.start));
  const ends = ordered.map((s, i) => (starts[i] ?? 0) + s.values.length - 1);
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  const values: (number | null)[] = [];
  const quality: number[] = [];
  const segments: { start: string; source: string }[] = [];
  const used = new Set<string>();
  let currentSource = "";
  for (let day = first; day <= last; day++) {
    let value: number | null = null;
    let flag = 2;
    let source = currentSource;
    for (const [i, candidate] of ordered.entries()) {
      const offset = day - (starts[i] ?? 0);
      const v = candidate.values[offset];
      if (v !== undefined && v !== null) {
        value = v;
        flag = candidate.quality[offset] ?? 0;
        source = candidate.provenance.source;
        for (const segment of candidate.segments ?? []) {
          if (toDay(segment.start) > day) break;
          source = segment.source;
        }
        break;
      }
    }
    if (value !== null) {
      used.add(source);
      if (source !== currentSource) {
        segments.push({ start: fromDay(day), source });
        currentSource = source;
      }
    }
    values.push(value);
    quality.push(flag);
  }
  return {
    ...top,
    start: fromDay(first),
    values,
    quality,
    segments,
    provenance: {
      ...top.provenance,
      period: { start: fromDay(first), end: fromDay(last) },
      derived_from: [...used],
      method: [...used].some((id) => id === "gldas_noah" || id === "nldas_noah")
        ? "priority_splice; includes modeled land-surface estimates"
        : "priority_splice",
      quality: ordered.some((s) => s.provenance.quality === "low") ? "low" : top.provenance.quality,
      resolution_m: Math.max(...ordered.map((s) => s.provenance.resolution_m)),
    },
  };
}

/**
 * One series per canonical variable. Daily series from several sources are spliced step by step
 * in manifest priority order (a short high-priority record, such as 5 years of IMERG, keeps the
 * long POWER record behind it). Series on different grids cannot be spliced: the one with the
 * earliest-starting record (the longest history for the replay) wins and an info gap names the others.
 */
export function mergeSeries(
  candidates: CanonicalSeries[],
  chains: PriorityChains,
): { series: CanonicalSeries[]; gaps: Gap[] } {
  const byVar = new Map<string, CanonicalSeries[]>();
  for (const series of candidates)
    byVar.set(series.var, [...(byVar.get(series.var) ?? []), series]);
  const merged: CanonicalSeries[] = [];
  const gaps: Gap[] = [];
  for (const [variable, group] of byVar) {
    const ranked = [...group].sort((a, b) => rank(chains[variable], a) - rank(chains[variable], b));
    const unit = ranked[0]?.unit;
    const ordered = ranked.filter((s) => s.unit === unit);
    const incompatible = ranked.filter((s) => s.unit !== unit);
    if (incompatible.length) {
      gaps.push({
        var: variable,
        reason: `kept ${unit}; ${incompatible.map((s) => s.provenance.source).join(", ")} use incompatible units`,
        severity: "info",
      });
    }
    const [only] = ordered;
    if (!only) continue;
    if (ordered.length === 1) {
      merged.push(only);
    } else if (ordered.every((s) => s.cadence === "daily")) {
      merged.push(spliceDaily(ordered));
    } else {
      const earliest = [...ordered].sort((a, b) => a.start.localeCompare(b.start))[0] ?? only;
      merged.push(earliest);
      const dropped = ordered.filter((s) => s !== earliest).map((s) => s.provenance.source);
      gaps.push({
        var: variable,
        reason: `kept ${earliest.provenance.source}, which starts earliest; ${dropped.join(", ")} use a different time step and were not merged`,
        severity: "info",
      });
    }
  }
  return { series: merged, gaps };
}

/** Gap records for canonical variables that no source provided. */
export function missingVariableGaps(
  wanted: string[],
  series: CanonicalSeries[],
  existing: Gap[],
): Gap[] {
  const have = new Set(series.map((s) => s.var));
  const reported = new Set(existing.map((g) => g.var));
  return wanted
    .filter((v) => !have.has(v as CanonicalSeries["var"]) && !reported.has(v))
    .map((v) => ({ var: v, reason: "no source returned data", severity: "warning" as const }));
}
