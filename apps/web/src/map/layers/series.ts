import type { CanonicalSeries } from "@itza/engine/contracts";
import { type DateRange, fromDay, toDay } from "../timeline/periods";

function stepDay(series: CanonicalSeries, i: number): number {
  const start = toDay(series.start);
  switch (series.cadence) {
    case "daily":
      return start + i;
    case "weekly":
      return start + 7 * i;
    case "16day":
      return start + 16 * i;
    case "static":
      return start;
    case "monthly": {
      const d = new Date(`${series.start}T00:00:00Z`);
      return toDay(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, d.getUTCDate()))
          .toISOString()
          .slice(0, 10),
      );
    }
  }
}

export interface Step {
  date: string;
  value: number;
}

/** Observed or gap-filled steps (not missing ones) whose date is inside `range`. */
export function stepsIn(series: CanonicalSeries, range: DateRange): Step[] {
  const a = toDay(range.start);
  const b = toDay(range.end);
  const out: Step[] = [];
  for (const [i, v] of series.values.entries()) {
    if (v === null || v === undefined || series.quality[i] === 2) continue;
    const day = stepDay(series, i);
    if (day >= a && day <= b) out.push({ date: fromDay(day), value: v });
  }
  return out;
}

/** The last step on or before `date`, no older than `maxAgeDays`. */
export function latestBefore(
  series: CanonicalSeries,
  date: string,
  maxAgeDays: number,
): Step | null {
  const end = toDay(date);
  const found = stepsIn(series, { start: fromDay(end - maxAgeDays), end: date });
  return found[found.length - 1] ?? null;
}

/** First and last day the series covers. */
export function coverage(series: CanonicalSeries): DateRange {
  const last = Math.max(0, series.values.length - 1);
  return { start: fromDay(stepDay(series, 0)), end: fromDay(stepDay(series, last)) };
}
