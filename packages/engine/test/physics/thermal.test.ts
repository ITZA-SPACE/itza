import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { degreeDays, seasonLength, stageAt, thermalStress } from "../../src/physics";
import { packCrop } from "./helpers";

const wheat = packCrop("dz-high-plains", "bread_wheat");
// Frost limits -10, -8, -2, -3; heat limits 36, 34, 31, 32; stages 20, 60, 70, 30; base 0, max 32.
const length = seasonLength(wheat);
const flat = (value: number, n = length) => new Float64Array(n).fill(value);

describe("degreeDays", () => {
  it("averages the extremes above the base, with the minimum raised and the maximum capped", () => {
    expect(degreeDays(20, 10, 5)).toBeCloseTo(10);
    expect(degreeDays(20, 0, 5)).toBeCloseTo(7.5); // Tmin raised to 5
    expect(degreeDays(40, 10, 5, 30)).toBeCloseTo(15); // Tmax capped at 30
    expect(degreeDays(3, -2, 5)).toBe(0);
  });

  it("is never negative and never falls when it gets warmer", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -30, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 25, noNaN: true }),
        fc.double({ min: -5, max: 15, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        (tmin, range, base, warm) => {
          const tmax = tmin + range;
          const d = degreeDays(tmax, tmin, base);
          return d >= 0 && degreeDays(tmax + warm, tmin + warm, base) >= d - 1e-9;
        },
      ),
    );
  });
});

describe("thermalStress", () => {
  it("counts nothing in a mild season and sums degree days", () => {
    const result = thermalStress(wheat, 0, flat(20), flat(10));
    expect(result.frostDays).toEqual([0, 0, 0, 0]);
    expect(result.heatDays).toEqual([0, 0, 0, 0]);
    expect(result.frostIndex).toBe(0);
    expect(result.heatIndex).toBe(0);
    expect(result.days).toBe(length);
    expect(result.gdd).toBeCloseTo(length * 15);
  });

  it("applies the threshold of the stage each day falls in", () => {
    // Tmin of -3 is a frost only in mid and late season (limits -2 and -3), not in earlier stages.
    const tmin = flat(-3);
    const result = thermalStress(wheat, 0, flat(20), tmin);
    expect(result.frostDays).toEqual([0, 0, 70, 30]);
    // Tmax of 33 is a heat day in the development, mid and late stages (34 > 33, so not dev).
    const heat = thermalStress(wheat, 0, flat(33), flat(10));
    expect(heat.heatDays).toEqual([0, 0, 70, 30]);
  });

  it("weights events by stage sensitivity", () => {
    const tmin = flat(10);
    tmin[stageStart(2)] = -5; // one frost day in mid-season (weight 1)
    tmin[stageStart(0)] = -11; // one frost day in the initial stage (weight 0.3)
    const result = thermalStress(wheat, 0, flat(20), tmin);
    expect(result.frostDays).toEqual([1, 0, 1, 0]);
    expect(result.frostIndex).toBeCloseTo(1.3);
    const tmax = flat(20);
    tmax[stageStart(3)] = 40; // late-season heat (weight 0.7)
    expect(thermalStress(wheat, 0, tmax, flat(10)).heatIndex).toBeCloseTo(0.7);
  });

  it("starts at the sowing index and stops where the series ends", () => {
    const result = thermalStress(wheat, 10, flat(20, 60), flat(10, 60));
    expect(result.days).toBe(50);
    const early = thermalStress(wheat, -5, flat(20, 30), flat(10, 30));
    expect(early.days).toBe(30);
    expect(stageAt(wheat, 0)).toBe(0);
  });

  it("never counts more days than the season has", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -20, max: 45, noNaN: true }), { minLength: 1, maxLength: 400 }),
        fc.integer({ min: -20, max: 100 }),
        (temps, sowing) => {
          const r = thermalStress(
            wheat,
            sowing,
            Float64Array.from(temps),
            Float64Array.from(temps),
          );
          return (
            r.days <= length &&
            r.frostDays.reduce((a, b) => a + b, 0) <= r.days &&
            r.heatDays.reduce((a, b) => a + b, 0) <= r.days &&
            r.gdd >= 0
          );
        },
      ),
    );
  });
});

/** Index of the first day of a stage (0 initial ... 3 late). */
function stageStart(stage: 0 | 1 | 2 | 3): number {
  for (let d = 0; d < length; d++) if (stageAt(wheat, d) === stage) return d;
  throw new Error("stage not found");
}
