import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CanonicalSeries, EngineOutput, FieldBundle } from "../../src/contracts";
import {
  applyScenario,
  PRESET_DELTAS,
  PRESET_IDS,
  presetScenario,
  robustness,
  SLIDER_LIMITS,
  sliderScenario,
} from "../../src/decisions";
import { buildDailyForcing, fromDayNumber, toDayNumber } from "../../src/physics";
import { scoreReplay, simulateReplay } from "../../src/replay";
import { makeBundle, makeInput, PRIORITIES } from "../replay/helpers";

const bundle = makeBundle(3);
const daily = (b: FieldBundle, name: CanonicalSeries["var"]) =>
  b.series.find((s) => s.var === name && s.cadence === "daily") as CanonicalSeries;
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

describe("sliderScenario", () => {
  it("builds a slider scenario inside the control ranges", () => {
    expect(sliderScenario("s", -20, 2)).toEqual({
      id: "s",
      kind: "slider",
      delta_rain_pct: -20,
      delta_temp_c: 2,
    });
    expect(SLIDER_LIMITS).toEqual({ rainPct: { min: -30, max: 30 }, tempC: { min: 0, max: 4 } });
  });

  it("rejects values outside the ranges", () => {
    expect(() => sliderScenario("s", -31, 0)).toThrow(RangeError);
    expect(() => sliderScenario("s", 31, 0)).toThrow(RangeError);
    expect(() => sliderScenario("s", 0, -1)).toThrow(RangeError);
    expect(() => sliderScenario("s", 0, 4.5)).toThrow(RangeError);
    expect(() => sliderScenario("s", Number.NaN, 0)).toThrow(RangeError);
  });
});

describe("applyScenario", () => {
  it("returns the same bundle for history", () => {
    expect(applyScenario(bundle, { id: "history", kind: "history" })).toBe(bundle);
  });

  it("scales rain and shifts temperature for a slider, keeping gaps and untouched series", () => {
    const withGap = structuredClone(bundle);
    (daily(withGap, "precip").values as (number | null)[])[10] = null;
    const out = applyScenario(withGap, sliderScenario("dry_hot", -20, 2));
    const rain = daily(out, "precip");
    const base = daily(withGap, "precip");
    expect(rain.values[10]).toBeNull();
    expect(sum(rain.values)).toBeCloseTo(sum(base.values) * 0.8, 6);
    expect(daily(out, "tmax").values[5]).toBeCloseTo(
      (daily(withGap, "tmax").values[5] as number) + 2,
      9,
    );
    expect(daily(out, "rh")).toBe(daily(withGap, "rh"));
    expect(out.series.find((s) => s.var === "ndvi")).toBe(
      withGap.series.find((s) => s.var === "ndvi"),
    );
    expect(rain.quality).toEqual(base.quality);
    expect(rain.provenance.method).toMatch(/scenario dry_hot/);
    expect(base.provenance.method).not.toMatch(/scenario/);
  });

  it("does not modify its input", () => {
    const copy = structuredClone(bundle);
    applyScenario(bundle, sliderScenario("s", -30, 4));
    expect(bundle).toEqual(copy);
  });

  it("raises ET0 when it is warmer and leaves it alone when nothing changes", () => {
    const base = buildDailyForcing(bundle);
    const warm = buildDailyForcing(applyScenario(bundle, sliderScenario("w", 0, 3)));
    const same = buildDailyForcing(applyScenario(bundle, sliderScenario("n", 0, 0)));
    const total = (f: { et0: Float64Array }) => f.et0.reduce((a, b) => a + b, 0);
    expect(total(warm)).toBeGreaterThan(total(base) * 1.05);
    expect(total(same)).toBeCloseTo(total(base), 6);
  });

  it("applies monthly factors by calendar month, additive and multiplicative", () => {
    const months = (neutral: number, at: number, value: number) =>
      Array.from({ length: 12 }, (_, m) => (m === at ? value : neutral));
    const out = applyScenario(bundle, {
      id: "march",
      kind: "projection",
      monthly_factors: {
        tmax: { kind: "additive", values: months(0, 2, 5) },
        precip: { kind: "multiplicative", values: months(1, 2, 2) },
      },
    });
    const start = toDayNumber(daily(bundle, "tmax").start);
    daily(bundle, "tmax").values.forEach((v, i) => {
      const march = fromDayNumber(start + i).month === 3;
      expect(daily(out, "tmax").values[i]).toBeCloseTo((v as number) + (march ? 5 : 0), 9);
      expect(daily(out, "precip").values[i]).toBeCloseTo(
        (daily(bundle, "precip").values[i] as number) * (march ? 2 : 1),
        9,
      );
    });
    expect(daily(out, "tmin")).toBe(daily(bundle, "tmin"));
  });

  it("maps wind to the 2 m wind series and bounds humidity to 0-100", () => {
    const out = applyScenario(bundle, {
      id: "x",
      kind: "projection",
      monthly_factors: {
        wind: { kind: "multiplicative", values: new Array(12).fill(1.5) },
        rh: { kind: "additive", values: new Array(12).fill(60) },
      },
    });
    expect(daily(out, "wind2m").values[0]).toBeCloseTo(
      (daily(bundle, "wind2m").values[0] as number) * 1.5,
      9,
    );
    expect(Math.max(...(daily(out, "rh").values as number[]))).toBe(100);
  });

  it("rejects unknown variables and factor lists that are not 12 long", () => {
    const bad = (monthly_factors: never) => () =>
      applyScenario(bundle, { id: "x", kind: "projection", monthly_factors });
    expect(bad({ snow: { kind: "additive", values: new Array(12).fill(0) } } as never)).toThrow(
      /Unknown scenario variable/,
    );
    expect(bad({ tmax: { kind: "additive", values: [1, 2] } } as never)).toThrow(/12 values/);
  });

  it("never produces negative rain or humidity outside 0-100, whatever the factors", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -300, max: 300, noNaN: true }),
        (rainPct, rhShift) => {
          const out = applyScenario(bundle, {
            id: "p",
            kind: "slider",
            delta_rain_pct: rainPct,
            monthly_factors: { rh: { kind: "additive", values: new Array(12).fill(rhShift) } },
          });
          for (const v of daily(out, "precip").values)
            expect(v as number).toBeGreaterThanOrEqual(0);
          for (const v of daily(out, "rh").values) {
            expect(v as number).toBeGreaterThanOrEqual(0);
            expect(v as number).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});

describe("presets", () => {
  const monthMean = (b: FieldBundle, name: CanonicalSeries["var"], month: number) => {
    const s = daily(b, name);
    const start = toDayNumber(s.start);
    const picked = s.values.filter((_, i) => fromDayNumber(start + i).month === month);
    return sum(picked) / picked.length;
  };

  it("documents three presets", () => {
    expect(PRESET_IDS).toEqual(["drought_year", "hot_spring", "wet_spring"]);
    expect(PRESET_DELTAS.drought_year).toEqual({ rainPct: -30, tempC: 1, springOnly: false });
  });

  it("drought year: rain -30 % and +1 C all year", () => {
    const out = applyScenario(bundle, presetScenario("drought_year", 36));
    expect(sum(daily(out, "precip").values)).toBeCloseTo(
      sum(daily(bundle, "precip").values) * 0.7,
      6,
    );
    expect(monthMean(out, "tmax", 7) - monthMean(bundle, "tmax", 7)).toBeCloseTo(1, 9);
  });

  it("hot spring: +3 C in March to May only, no rain change", () => {
    const out = applyScenario(bundle, presetScenario("hot_spring", 36));
    for (const m of [3, 4, 5])
      expect(monthMean(out, "tmax", m) - monthMean(bundle, "tmax", m)).toBeCloseTo(3, 9);
    for (const m of [1, 6, 9])
      expect(monthMean(out, "tmax", m)).toBeCloseTo(monthMean(bundle, "tmax", m), 9);
    expect(daily(out, "precip")).toBe(daily(bundle, "precip"));
  });

  it("wet spring: rain +30 % in March to May only, no temperature change", () => {
    const out = applyScenario(bundle, presetScenario("wet_spring", 36));
    for (const m of [3, 4, 5])
      expect(monthMean(out, "precip", m)).toBeCloseTo(monthMean(bundle, "precip", m) * 1.3, 9);
    expect(monthMean(out, "precip", 7)).toBeCloseTo(monthMean(bundle, "precip", 7), 9);
    expect(daily(out, "tmax")).toBe(daily(bundle, "tmax"));
  });

  it("moves spring to September to November in the southern hemisphere", () => {
    const out = applyScenario(bundle, presetScenario("hot_spring", -30));
    expect(monthMean(out, "tmax", 10) - monthMean(bundle, "tmax", 10)).toBeCloseTo(3, 9);
    expect(monthMean(out, "tmax", 4)).toBeCloseTo(monthMean(bundle, "tmax", 4), 9);
  });
});

describe("scenario replays", () => {
  const input = makeInput({ monte_carlo_draws: 0 });
  const long = makeBundle(12);
  const score = (scenario: (typeof input)["scenario"], rotation = "wheat_continuous") => {
    const out = scoreReplay(
      simulateReplay({ bundle: long, input: { ...input, scenario } }),
      PRIORITIES,
    );
    return { out, score: out.results.find((r) => r.rotation_id === rotation)?.score as number };
  };

  it("echoes the scenario id and lowers the water balance in a drought year", () => {
    const history = score({ id: "history", kind: "history" });
    const drought = score(presetScenario("drought_year", 36));
    expect(drought.out.scenario_id).toBe("drought_year");
    const water = (o: EngineOutput) =>
      o.results
        .find((r) => r.rotation_id === "wheat_continuous")
        ?.seasons.reduce((a, s) => a + s.criteria.water_balance, 0) as number;
    expect(water(drought.out)).toBeLessThan(water(history.out));
  });
});

describe("robustness", () => {
  const out = (scores: Record<string, number>): EngineOutput =>
    ({
      schema: "engine-output/1.0",
      scenario_id: "x",
      seed: 1,
      results: Object.entries(scores).map(([rotation_id, score]) => ({ rotation_id, score })),
    }) as unknown as EngineOutput;

  it("orders rotations by their worst score drop, smallest first", () => {
    const rows = robustness(out({ a: 0.8, b: 0.7, c: 0.6 }), {
      drought: out({ a: 0.5, b: 0.6, c: 0.6 }),
      hot: out({ a: 0.7, b: 0.4, c: 0.7 }),
    });
    expect(rows.map((r) => r.rotation_id)).toEqual(["c", "a", "b"]);
    expect(rows[0]).toMatchObject({ rotation_id: "c", worstDrop: 0 });
    expect(rows[1]?.worstDrop).toBeCloseTo(0.3, 6);
    expect(rows[1]?.drops.drought).toBeCloseTo(0.3, 6);
  });

  it("allows a negative worst drop and keeps history order on ties", () => {
    const rows = robustness(out({ a: 0.5, b: 0.5 }), { up: out({ a: 0.6, b: 0.6 }) });
    expect(rows.map((r) => r.rotation_id)).toEqual(["a", "b"]);
    expect(rows[0]?.worstDrop).toBeLessThan(0);
  });

  it("handles no scenarios and rotations missing from a scenario", () => {
    expect(robustness(out({ a: 0.5 }), {})[0]).toMatchObject({ worstDrop: 0, drops: {} });
    expect(robustness(out({ a: 0.5 }), { s: out({ z: 0.1 }) })[0]?.drops).toEqual({});
  });
});
