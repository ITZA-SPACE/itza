export type Granularity = "month" | "season" | "year";
export interface DateRange {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

export const toDay = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const fromDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);
const iso = (y: number, m: number, d: number): string =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** First month (0-11, may be -1 for the December before) of the block that holds month `m`. */
const seasonStart = (m: number): number => m - ((m + 1) % 3);
const MONTHS = { month: 1, season: 3, year: 12 } as const;

/** The month, season (Dec-Feb, Mar-May, ...) or calendar year that holds `date`. */
export function periodFor(date: string, g: Granularity): DateRange {
  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const first = g === "month" ? m : g === "season" ? seasonStart(m) : 0;
  return {
    start: iso(y, first, 1),
    end: iso(y, first + MONTHS[g], 0),
  };
}

/** Start dates of every period that touches `bounds`, oldest first. */
export function periodStarts(bounds: DateRange, g: Granularity): string[] {
  const out: string[] = [];
  let cursor = periodFor(bounds.start, g).start;
  while (cursor <= bounds.end) {
    out.push(cursor);
    cursor = fromDay(toDay(periodFor(cursor, g).end) + 1);
  }
  return out;
}

const monthYear = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthOnly = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/** "Jun 2024", "Mar-May 2024" or "2024". */
export function labelFor(date: string, g: Granularity): string {
  const p = periodFor(date, g);
  const start = new Date(`${p.start}T00:00:00Z`);
  const end = new Date(`${p.end}T00:00:00Z`);
  if (g === "year") return String(start.getUTCFullYear());
  if (g === "month") return monthYear.format(start);
  return start.getUTCFullYear() === end.getUTCFullYear()
    ? `${monthOnly.format(start)}–${monthYear.format(end)}`
    : `${monthYear.format(start)}–${monthYear.format(end)}`;
}

/** The same period shifted by whole years (leap days roll forward). */
export function shiftYears(range: DateRange, years: number): DateRange {
  const move = (s: string) => {
    const d = new Date(`${s}T00:00:00Z`);
    return iso(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate());
  };
  return { start: move(range.start), end: move(range.end) };
}
