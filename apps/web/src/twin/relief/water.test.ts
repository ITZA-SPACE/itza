import { describe, expect, it } from "vitest";
import { createWater, downsample, stableDt } from "./water";

const MM_PER_HOUR = 1 / 1000 / 3600;

function grid(width: number, height: number, at: (col: number, row: number) => number) {
  const heights = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) heights[row * width + col] = at(col, row);
  }
  return heights;
}

/** Deterministic bumps: no random source, so a failure reproduces. */
const bumps = (scale: number) => (col: number, row: number) =>
  scale * (Math.sin(col * 0.9) + Math.cos(row * 0.7) + Math.sin((col + row) * 0.37));

describe("water", () => {
  it("conserves water: rained equals standing plus left", () => {
    const water = createWater(grid(32, 32, bumps(0.3)), 32, 32, 2);
    const dt = stableDt(2);
    for (let i = 0; i < 500; i++) water.step(dt, 50 * MM_PER_HOUR);
    const { rainedM3, leftM3, standingM3 } = water.totals();
    expect(rainedM3).toBeGreaterThan(0);
    expect(Math.abs(rainedM3 - standingM3 - leftM3) / rainedM3).toBeLessThan(1e-3);
  });

  it("drains a tilted plane", () => {
    const water = createWater(
      grid(24, 24, (col) => col * 0.2),
      24,
      24,
      2,
    );
    const dt = stableDt(2);
    for (let i = 0; i < 100; i++) water.step(dt, 100 * MM_PER_HOUR);
    for (let i = 0; i < 6000; i++) water.step(dt, 0);
    const { rainedM3, leftM3 } = water.totals();
    // A thinning sheet slows as it drains, so the last film takes far longer than the storm.
    expect(leftM3 / rainedM3).toBeGreaterThan(0.9);
    // Nothing piles up against the slope: the uphill half is no wetter than the downhill half.
    const wet = (from: number) => {
      let sum = 0;
      for (let row = 0; row < 24; row++)
        for (let col = from; col < from + 12; col++) sum += water.depth[row * 24 + col] as number;
      return sum;
    };
    expect(wet(12)).toBeLessThanOrEqual(wet(0) + 1e-9);
  });

  it("collects water at the bottom of a bowl and lets none out", () => {
    const size = 21;
    const centre = 10;
    const bowl = grid(size, size, (col, row) => {
      const rim = col === 0 || row === 0 || col === size - 1 || row === size - 1;
      return rim ? 50 : 0.05 * ((col - centre) ** 2 + (row - centre) ** 2);
    });
    const water = createWater(bowl, size, size, 2);
    const dt = stableDt(2);
    for (let i = 0; i < 200; i++) water.step(dt, 60 * MM_PER_HOUR);
    for (let i = 0; i < 3000; i++) water.step(dt, 0);
    let deepest = 0;
    for (let i = 1; i < water.depth.length; i++) {
      if ((water.depth[i] as number) > (water.depth[deepest] as number)) deepest = i;
    }
    expect(deepest).toBe(centre * size + centre);
    // Only the rain that fell on the rim cells themselves can leave.
    const { rainedM3, leftM3 } = water.totals();
    expect(leftM3 / rainedM3).toBeLessThan((4 * size) / (size * size));
  });

  it("keeps a flat field level under even rain away from the open edges", () => {
    const water = createWater(new Float32Array(32 * 32), 32, 32, 2);
    for (let i = 0; i < 3; i++) water.step(stableDt(2), 30 * MM_PER_HOUR);
    let low = Infinity;
    let high = -Infinity;
    for (let row = 12; row < 20; row++) {
      for (let col = 12; col < 20; col++) {
        const d = water.depth[row * 32 + col] as number;
        low = Math.min(low, d);
        high = Math.max(high, d);
      }
    }
    expect(high).toBeGreaterThan(0);
    expect(high - low).toBeLessThan(1e-9);
  });

  // About 0.5 s on a laptop but over 5 s on a shared CI runner, so it gets its own timeout.
  it("never produces negative or non-finite depth on steep ground", { timeout: 30_000 }, () => {
    const water = createWater(grid(64, 64, bumps(4)), 64, 64, 2);
    const dt = stableDt(2);
    for (let i = 0; i < 2000; i++) water.step(dt, 200 * MM_PER_HOUR);
    for (const d of water.depth) {
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it("does nothing without rain on dry ground", () => {
    const water = createWater(grid(8, 8, bumps(1)), 8, 8, 2);
    for (let i = 0; i < 50; i++) water.step(stableDt(2), 0);
    expect(Math.max(...water.depth)).toBe(0);
    expect(water.totals()).toEqual({ rainedM3: 0, leftM3: 0, standingM3: 0 });
  });

  it("rejects non-finite heights and a wrong grid", () => {
    const bad = new Float32Array(16);
    bad[5] = Number.NaN;
    expect(() => createWater(bad, 4, 4, 2)).toThrow(RangeError);
    expect(() => createWater(new Float32Array(15), 4, 4, 2)).toThrow(RangeError);
  });

  it("reset clears depth and totals", () => {
    const water = createWater(grid(8, 8, bumps(1)), 8, 8, 2);
    water.step(stableDt(2), 100 * MM_PER_HOUR);
    water.reset();
    expect(Math.max(...water.depth)).toBe(0);
    expect(water.totals()).toEqual({ rainedM3: 0, leftM3: 0, standingM3: 0 });
  });
});

describe("downsample", () => {
  it("reduces by a whole factor to at most maxSide", () => {
    const result = downsample(new Float32Array(570 * 567).fill(3), 570, 567, 256);
    expect([result.factor, result.width, result.height]).toEqual([3, 190, 189]);
    expect(result.heights[0]).toBe(3);
  });

  it("averages each block", () => {
    const result = downsample(new Float32Array([1, 3, 10, 20, 5, 7, 30, 40]), 4, 2, 2);
    expect([...result.heights]).toEqual([4, 25]);
  });

  it("returns a small grid unchanged", () => {
    const heights = new Float32Array(16);
    expect(downsample(heights, 4, 4, 256)).toEqual({ heights, width: 4, height: 4, factor: 1 });
  });
});
