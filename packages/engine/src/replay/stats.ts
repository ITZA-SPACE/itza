/** Quantile with linear interpolation (type 7) of an ascending-sorted array; q in [0, 1]. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) throw new RangeError("quantile of an empty sample");
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** Lower median: the middle element, or the lower of the two middle ones, so it is a real sample. */
export function lowerMedianIndex(n: number): number {
  return Math.floor((n - 1) / 2);
}

/** Rounds to 6 decimals so outputs are identical across platforms despite last-bit libm differences. */
export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
