import type { Gap, Period, Severity } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function gap(variable: string, reason: string, severity: Severity = "warning"): Gap {
  return { var: variable, reason, severity };
}

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / DAY_MS);
}

/** Every date from `start` to `end`, inclusive. */
export function eachDay(period: Period): string[] {
  const days: string[] = [];
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** POWER date key, for example 20230131. */
export function compactDate(iso: string): string {
  return iso.replaceAll("-", "");
}

export function todayIso(now: Date): string {
  return isoDate(now);
}

export function qualityFromCoverage(observed: number, total: number): "high" | "medium" | "low" {
  const share = total === 0 ? 0 : observed / total;
  if (share >= 0.9) return "high";
  if (share >= 0.6) return "medium";
  return "low";
}
