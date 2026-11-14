import { describe, expect, it } from "vitest";
import { fieldAverage } from "../../src/memory";
import {
  fillGaps,
  fitBias,
  harmonicFit,
  observations,
  smooth,
  toGrid,
} from "../../src/memory/series";
import { toDayNumber } from "../../src/physics/dates";

describe("fieldAverage", () => {
  it("weights pixels by overlap and drops masked or missing ones per step", () => {
    const out = fieldAverage([
      { weight: 3, values: [0.2, 0.4, null, 0.5], quality: [0, 0, 0, 2] },
      { weight: 1, values: [0.6, 0.8, 0.5, 0.9] },
      { weight: 0, values: [1, 1, 1, 1] },
    ]);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(0.9);
  });

  it("returns an empty series for no pixels and null where every pixel is out", () => {
    expect(fieldAverage([])).toEqual([]);
    expect(fieldAverage([{ weight: 1, values: [null] }])).toEqual([null]);
  });
});

describe("observations", () => {
  it("drops masked, missing and out-of-range values and dates the rest", () => {
    const obs = observations({
      sensor: "modis",
      cadence: "16day",
      start: "2020-01-01",
      values: [0.3, null, 0.4, 1.5, 0.5, -0.5],
      quality: [0, 0, 2, 0, 1, 0],
    });
    expect(obs.map((o) => o.v)).toEqual([0.3, 0.5]);
    expect(obs[1]?.day).toBe(toDayNumber("2020-01-01") + 64);
  });

  it("steps monthly series by calendar month and ignores static ones", () => {
    const monthly = observations({
      sensor: "modis",
      cadence: "monthly",
      start: "2020-01-15",
      values: [0.1, 0.2, 0.3],
      quality: [0, 0, 0],
    });
    expect(monthly.map((o) => o.day)).toEqual(
      ["2020-01-15", "2020-02-15", "2020-03-15"].map(toDayNumber),
    );
    expect(
      observations({
        sensor: "hls",
        cadence: "static",
        start: "2020-01-01",
        values: [0.5],
        quality: [0],
      }),
    ).toEqual([]);
  });
});

describe("toGrid", () => {
  it("places observations in the nearest 8-day cell and averages ties", () => {
    const g = toGrid(
      [
        { day: 100, v: 0.2 },
        { day: 103, v: 0.4 },
        { day: 108, v: 0.5 },
        { day: 500, v: 0.9 },
      ],
      100,
      3,
    );
    expect(g[0]).toBeCloseTo(0.3);
    expect(g[1]).toBeCloseTo(0.5);
    expect(g[2]).toBeNull();
  });
});

describe("fitBias", () => {
  it("recovers a linear relation between the sensors", () => {
    const modis = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, null];
    const hls = modis.map((v) => (v == null ? 0.9 : 1.1 * v - 0.02));
    const fit = fitBias(modis, hls);
    expect(fit?.slope).toBeCloseTo(1.1);
    expect(fit?.intercept).toBeCloseTo(-0.02);
    expect(fit?.overlapPoints).toBe(7);
  });

  it("gives up on little overlap, no variance or an absurd slope", () => {
    expect(fitBias([0.1, 0.2], [0.1, 0.2])).toBeNull();
    expect(fitBias(Array(8).fill(0.3), Array(8).fill(0.4))).toBeNull();
    const x = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    expect(
      fitBias(
        x,
        x.map((v) => 5 * v),
      ),
    ).toBeNull();
  });
});

describe("fillGaps", () => {
  it("interpolates gaps up to the limit and flags longer ones", () => {
    const v = [0, null, null, 3, null, null, null, null, null, 9, null];
    const r = fillGaps(v, 32);
    expect(r.values.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(r.flags.slice(0, 4)).toEqual([0, 1, 1, 0]);
    // 6 steps * 8 days = 48 days between the bracketing values: left open.
    expect(r.values[5]).toBeNull();
    expect(r.flags[5]).toBe(2);
    expect(r.flags[10]).toBe(2);
  });

  it("does not throw on an all-missing series", () => {
    expect(fillGaps([null, null], 32).flags).toEqual([2, 2]);
  });
});

describe("smooth", () => {
  const days = Array.from({ length: 20 }, (_, i) => i * 8);

  it("reproduces a quadratic exactly in the interior and keeps endpoints close", () => {
    const v = days.map((d) => 0.2 + 0.001 * d - 0.000004 * d * d);
    const out = smooth(v, days, 7);
    for (let i = 3; i < 17; i++) expect(out[i]).toBeCloseTo(v[i] as number, 9);
    expect(out[0]).toBe(v[0]);
  });

  it("damps a single-step spike", () => {
    const v = days.map((_, i) => (i === 10 ? 0.9 : 0.3));
    const out = smooth(v, days, 5);
    expect(out[10] as number).toBeLessThan(0.6);
  });

  it("uses the harmonic fit on runs shorter than the window and keeps nulls", () => {
    const d = Array.from({ length: 60 }, (_, i) => i * 8);
    const truth = (t: number) => 0.4 + 0.3 * Math.sin((2 * Math.PI * t) / 365.25);
    const v: (number | null)[] = d.map((t) => truth(t));
    for (const i of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24]) v[i] = null;
    const out = smooth(v, d, 7);
    expect(out[10]).toBeNull();
    expect(out[20]).toBeCloseTo(truth(160), 6); // run of length 1 between gaps
    expect(out[23]).toBeCloseTo(truth(184), 6);
  });

  it("leaves a short run alone when too little data supports a harmonic fit", () => {
    expect(smooth([0.3, 0.5, null], [0, 8, 16], 5)).toEqual([0.3, 0.5, null]);
  });
});

describe("harmonicFit", () => {
  it("refuses a degenerate design", () => {
    const d = Array.from({ length: 12 }, () => 100);
    expect(
      harmonicFit(
        d,
        d.map(() => 0.3),
      ),
    ).toBeNull();
  });
});
