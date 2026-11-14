import { type CopyKey, hasCopy, t } from "../copy";

/** `ssp245` as a person reads it: SSP2-4.5. Unknown scenarios keep their id. */
export function sspLabel(ssp: string): string {
  const key = `future.ssp.${ssp}.label`;
  return hasCopy(key) ? t(key as CopyKey) : ssp.toUpperCase();
}

export function sspDetail(ssp: string): string | undefined {
  const key = `future.ssp.${ssp}.detail`;
  return hasCopy(key) ? t(key as CopyKey) : undefined;
}

/** A change as a signed number with a real minus sign, for example `+0.03` or `−0.07`. */
export function signed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

const STEPS = 4;
const TARGET_YEAR = 2050;

/** The year a position on the time slider stands for, from this year (0) to 2050 (4). */
export function yearAt(step: number, thisYear = new Date().getFullYear()): number {
  return Math.round(thisYear + (step / STEPS) * (TARGET_YEAR - thisYear));
}

export const SLIDER_STEPS = STEPS;
