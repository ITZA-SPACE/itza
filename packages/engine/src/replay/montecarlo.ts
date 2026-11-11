/** Parameter uncertainty of the replay (TECHNICAL_ARCHITECTURE §6.4). */
export interface DrawParams {
  /** Multiplies every Kc of a crop (±10 %). */
  kcFactor: number;
  /** Multiplies the plant-available water per metre, so TAW (±20 %). */
  tawFactor: number;
  /** Whole days added to every sowing day (±10). */
  sowingShiftDays: number;
  /** Added to the depletion fraction p (±0.1). */
  depletionShift: number;
}

export const NOMINAL: DrawParams = {
  kcFactor: 1,
  tawFactor: 1,
  sowingShiftDays: 0,
  depletionShift: 0,
};

export const MAX_SOWING_SHIFT_DAYS = 10;

/** mulberry32: small seeded PRNG, uniform in [0, 1). Same seed, same sequence, on every platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` seeded draws, shared by every rotation so rotations are compared under the same
 * parameters (common random numbers).
 */
export function drawParameters(seed: number, count: number): DrawParams[] {
  const next = mulberry32(seed);
  const uniform = (half: number) => (next() * 2 - 1) * half;
  return Array.from({ length: count }, () => ({
    kcFactor: 1 + uniform(0.1),
    tawFactor: 1 + uniform(0.2),
    sowingShiftDays: Math.round(uniform(MAX_SOWING_SHIFT_DAYS)),
    depletionShift: uniform(0.1),
  }));
}
