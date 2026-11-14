import { toDayNumber } from "../physics/dates";
import type { NdviSource, PixelSeries } from "./types";

export const GRID_STEP = 8;
const NDVI_MIN = -0.2;
const MS_PER_DAY = 86_400_000;
const CADENCE_DAYS = { daily: 1, weekly: 7, "16day": 16 } as const;

/** Area-weighted field mean of pixel series; masked or missing pixels drop out of that step's weights. */
export function fieldAverage(pixels: PixelSeries[]): (number | null)[] {
  const length = Math.max(0, ...pixels.map((p) => p.values.length));
  const out: (number | null)[] = [];
  for (let i = 0; i < length; i++) {
    let sum = 0;
    let weight = 0;
    for (const p of pixels) {
      const v = p.values[i];
      if (p.weight > 0 && v != null && Number.isFinite(v) && p.quality?.[i] !== 2) {
        sum += p.weight * v;
        weight += p.weight;
      }
    }
    out.push(weight > 0 ? sum / weight : null);
  }
  return out;
}

/** Usable observations of a source as (day number, value); QA-masked and out-of-range values are dropped. */
export function observations(source: NdviSource): { day: number; v: number }[] {
  const cadence = source.cadence;
  if (cadence === "static") return [];
  const [y, m, d] = source.start.split("-").map(Number) as [number, number, number];
  const out: { day: number; v: number }[] = [];
  source.values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v) || v < NDVI_MIN || v > 1 || source.quality[i] === 2)
      return;
    const day =
      cadence === "monthly"
        ? Date.UTC(y, m - 1 + i, d) / MS_PER_DAY
        : toDayNumber(source.start) + i * CADENCE_DAYS[cadence];
    if (Number.isFinite(day)) out.push({ day, v });
  });
  return out;
}

/** Places observations on the grid: each lands in its nearest cell (at most 4 days away); ties average. */
export function toGrid(
  obs: { day: number; v: number }[],
  g0: number,
  n: number,
): (number | null)[] {
  const sum = new Array<number>(n).fill(0);
  const count = new Array<number>(n).fill(0);
  for (const { day, v } of obs) {
    const i = Math.round((day - g0) / GRID_STEP);
    if (i >= 0 && i < n) {
      sum[i] = (sum[i] as number) + v;
      count[i] = (count[i] as number) + 1;
    }
  }
  return sum.map((s, i) => ((count[i] as number) > 0 ? s / (count[i] as number) : null));
}

export interface BiasFit {
  slope: number;
  intercept: number;
  overlapPoints: number;
}

/** Least-squares line hls = slope * modis + intercept over cells where both have data; null if unusable. */
export function fitBias(modis: (number | null)[], hls: (number | null)[]): BiasFit | null {
  const xs: number[] = [];
  const ys: number[] = [];
  modis.forEach((x, i) => {
    const y = hls[i];
    if (x != null && y != null) {
      xs.push(x);
      ys.push(y);
    }
  });
  const n = xs.length;
  if (n < 6) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += ((xs[i] as number) - mx) ** 2;
    sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
  }
  if (sxx < 1e-6) return null;
  const slope = sxy / sxx;
  // A wild slope means the two sensors do not describe the same thing here; do not trust it.
  if (slope < 0.5 || slope > 2) return null;
  return { slope, intercept: my - slope * mx, overlapPoints: n };
}

/**
 * Interpolates linearly across runs of missing cells whose bracketing valid cells are at most
 * `maxGapDays` apart. flags: 0 observed, 1 interpolated, 2 missing (long gap, leading or trailing).
 */
export function fillGaps(
  values: (number | null)[],
  maxGapDays: number,
): { values: (number | null)[]; flags: number[] } {
  const out = values.slice();
  const flags: number[] = values.map((v) => (v == null ? 2 : 0));
  let prev = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (prev >= 0 && i - prev > 1 && (i - prev) * GRID_STEP <= maxGapDays) {
      const a = values[prev] as number;
      const b = values[i] as number;
      for (let k = prev + 1; k < i; k++) {
        out[k] = a + ((b - a) * (k - prev)) / (i - prev);
        flags[k] = 1;
      }
    }
    prev = i;
  }
  return { values: out, flags };
}

/** Quadratic Savitzky-Golay weights for half-width m (window 2m+1), centre point. */
function sgWeights(m: number): number[] {
  const den = (2 * m + 3) * (2 * m + 1) * (2 * m - 1);
  const w: number[] = [];
  for (let j = -m; j <= m; j++) w.push((3 * (3 * m * m + 3 * m - 1 - 5 * j * j)) / den);
  return w;
}

/** Annual two-harmonic least-squares fit over the valid points; null if it cannot be solved. */
export function harmonicFit(
  days: number[],
  values: (number | null)[],
): ((day: number) => number) | null {
  const basis = (t: number): number[] => {
    const a = (2 * Math.PI * t) / 365.25;
    return [1, Math.cos(a), Math.sin(a), Math.cos(2 * a), Math.sin(2 * a)];
  };
  const k = 5;
  const m: number[][] = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  const row = (r: number): number[] => m[r] as number[];
  let n = 0;
  values.forEach((v, i) => {
    if (v == null) return;
    n++;
    const b = basis(days[i] as number);
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++)
        row(r)[c] = (row(r)[c] as number) + (b[r] as number) * (b[c] as number);
      row(r)[k] = (row(r)[k] as number) + (b[r] as number) * v;
    }
  });
  if (n < 2 * k) return null;
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(row(r)[col] as number) > Math.abs(row(pivot)[col] as number)) pivot = r;
    }
    if (Math.abs(row(pivot)[col] as number) < 1e-9) return null;
    [m[col], m[pivot]] = [row(pivot), row(col)];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = (row(r)[col] as number) / (row(col)[col] as number);
      for (let c = col; c <= k; c++)
        row(r)[c] = (row(r)[c] as number) - f * (row(col)[c] as number);
    }
  }
  const coef = m.map((r, i) => (r[k] as number) / (r[i] as number));
  return (day) => basis(day).reduce((s, b, i) => s + b * (coef[i] as number), 0);
}

/**
 * Savitzky-Golay smoothing within each unbroken run of values. Near a run's ends the window
 * shrinks symmetrically; runs shorter than the window use the harmonic fit when it can be solved,
 * and are otherwise left as they are.
 */
export function smooth(
  values: (number | null)[],
  days: number[],
  window: 5 | 7,
): (number | null)[] {
  const out = values.slice();
  const half = (window - 1) / 2;
  let i = 0;
  while (i < values.length) {
    if (values[i] == null) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < values.length && values[j + 1] != null) j++;
    if (j - i + 1 < window) {
      // Fit only the year around the run, so other seasons' crops do not leak into it.
      const centre = ((days[i] as number) + (days[j] as number)) / 2;
      const near = values.map((v, k) => (Math.abs((days[k] as number) - centre) <= 183 ? v : null));
      const harmonic = harmonicFit(days, near);
      if (harmonic) for (let k = i; k <= j; k++) out[k] = clampNdvi(harmonic(days[k] as number));
    } else {
      for (let k = i; k <= j; k++) {
        const m = Math.min(half, k - i, j - k);
        if (m < 2) continue;
        const w = sgWeights(m);
        let s = 0;
        for (let o = -m; o <= m; o++) s += (w[o + m] as number) * (values[k + o] as number);
        out[k] = clampNdvi(s);
      }
    }
    i = j + 1;
  }
  return out;
}

const clampNdvi = (x: number): number => Math.min(1, Math.max(NDVI_MIN, x));
