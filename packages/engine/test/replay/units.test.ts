import { loadPack } from "@itza/knowledge";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDailyForcing, toDayNumber } from "../../src/physics";
import {
  agriculturalYears,
  CRITERIA,
  canopyCurve,
  composite,
  criterionWeights,
  drawParameters,
  erosionIndex,
  groundCoverMonths,
  lowerMedianIndex,
  monthlyCover,
  monthSpans,
  mulberry32,
  nitrogenScore,
  pestPressure,
  quantileSorted,
  resilience,
  round6,
  slopeFactor,
  sowingDayIn,
  type WeatherRisk,
  weatherRisks,
  winRate,
} from "../../src/replay";
import { packCrop } from "../physics/helpers";
import { makeBundle, PRIORITIES } from "./helpers";

const pack = loadPack("dz-high-plains");
const entry = (id: string) => pack.crops.find((c) => c.id === id) as (typeof pack.crops)[number];
const NEUTRAL: WeatherRisk = { wet: 1, warm_dry: 1, none: 1 };

describe("stats", () => {
  it("interpolates quantiles between sorted values", () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5);
    expect(quantileSorted([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(quantileSorted([7], 0.9)).toBe(7);
    expect(() => quantileSorted([], 0.5)).toThrow(RangeError);
  });

  it("keeps quantiles inside the sample and monotone in q", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 40 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (values, q1, q2) => {
          const sorted = Float64Array.from(values).sort();
          const [lo, hi] = q1 <= q2 ? [q1, q2] : [q2, q1];
          const a = quantileSorted(sorted, lo);
          const b = quantileSorted(sorted, hi);
          expect(a).toBeLessThanOrEqual(b + 1e-12);
          expect(a).toBeGreaterThanOrEqual(sorted[0] as number);
          expect(b).toBeLessThanOrEqual(sorted[sorted.length - 1] as number);
        },
      ),
    );
  });

  it("picks the lower median and rounds to six decimals", () => {
    expect(lowerMedianIndex(1)).toBe(0);
    expect(lowerMedianIndex(4)).toBe(1);
    expect(lowerMedianIndex(5)).toBe(2);
    expect(round6(0.12345649)).toBe(0.123456);
    expect(round6(0.1234565001)).toBe(0.123457);
  });
});

describe("montecarlo", () => {
  it("is deterministic and stays inside the documented ranges", () => {
    expect(drawParameters(42, 200)).toEqual(drawParameters(42, 200));
    expect(drawParameters(42, 5)).not.toEqual(drawParameters(43, 5));
    for (const d of drawParameters(1, 500)) {
      expect(d.kcFactor).toBeGreaterThanOrEqual(0.9);
      expect(d.kcFactor).toBeLessThanOrEqual(1.1);
      expect(d.tawFactor).toBeGreaterThanOrEqual(0.8);
      expect(d.tawFactor).toBeLessThanOrEqual(1.2);
      expect(Math.abs(d.sowingShiftDays)).toBeLessThanOrEqual(10);
      expect(Number.isInteger(d.sowingShiftDays)).toBe(true);
      expect(Math.abs(d.depletionShift)).toBeLessThanOrEqual(0.1);
    }
    expect(drawParameters(5, 0)).toEqual([]);
  });

  it("generates uniform values in [0, 1)", () => {
    const next = mulberry32(123);
    const values = Array.from({ length: 1000 }, next);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeCloseTo(0.5, 1);
  });
});

describe("score", () => {
  const priorities = fc.record({
    water: fc.integer({ min: 0, max: 5 }),
    soil_health: fc.integer({ min: 0, max: 5 }),
    nitrogen: fc.integer({ min: 0, max: 5 }),
    erosion: fc.integer({ min: 0, max: 5 }),
    forage: fc.integer({ min: 0, max: 5 }),
    income: fc.integer({ min: 0, max: 5 }),
    pest_break: fc.integer({ min: 0, max: 5 }),
  });

  it("normalizes any priorities to weights that sum to 1", () => {
    fc.assert(
      fc.property(priorities, (p) => {
        const w = criterionWeights(p);
        expect(w).toHaveLength(CRITERIA.length);
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("falls back to equal weights when every priority is zero", () => {
    const w = criterionWeights({
      ...PRIORITIES,
      water: 0,
      soil_health: 0,
      nitrogen: 0,
      erosion: 0,
      forage: 0,
      income: 0,
      pest_break: 0,
    });
    expect([...w]).toEqual(CRITERIA.map(() => 1 / CRITERIA.length));
  });

  it("sends each priority to its criteria", () => {
    const only = (key: keyof typeof PRIORITIES) => {
      const p = {
        water: 0,
        soil_health: 0,
        nitrogen: 0,
        erosion: 0,
        forage: 0,
        income: 0,
        pest_break: 0,
        [key]: 3,
      };
      return Object.fromEntries(
        CRITERIA.map((c, k) => [c, criterionWeights(p)[k]]).filter(([, v]) => (v as number) > 0),
      );
    };
    expect(only("nitrogen")).toEqual({ soil_nitrogen: 1 });
    expect(only("pest_break")).toEqual({ pest_pressure: 1 });
    expect(Object.keys(only("water")).sort()).toEqual(["climate_fit", "water_balance"]);
    expect(only("forage")).toEqual(only("income"));
  });

  it("contributions sum to the composite and a perfect season scores 1", () => {
    fc.assert(
      fc.property(
        priorities,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 8, maxLength: 8 }),
        (p, criteria) => {
          const out = new Float64Array(8);
          const total = composite(criteria, criterionWeights(p), out);
          expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 12);
          expect(total).toBeGreaterThanOrEqual(0);
          expect(total).toBeLessThanOrEqual(1 + 1e-12);
        },
      ),
    );
    expect(composite(new Array(8).fill(1), criterionWeights(PRIORITIES))).toBeCloseTo(1, 12);
  });
});

describe("soil health", () => {
  it("scores nitrogen from the previous crop's credit, neutral at zero", () => {
    expect(nitrogenScore(0)).toBe(0.5);
    expect(nitrogenScore(60)).toBe(1);
    expect(nitrogenScore(-60)).toBe(0);
    expect(nitrogenScore(500)).toBe(1);
    expect(nitrogenScore(15)).toBeGreaterThan(nitrogenScore(-10));
  });

  const year = agriculturalYears(buildDailyForcing(makeBundle(2)), 9)[0] as ReturnType<
    typeof agriculturalYears
  >[number];
  const spans = monthSpans(year, 9);

  it("splits an agricultural year into twelve contiguous months", () => {
    expect(spans).toHaveLength(12);
    expect(spans[0]?.start).toBe(year.startDay);
    expect(spans[11]?.end).toBe(year.endDay);
    for (const [i, span] of spans.slice(1).entries()) {
      expect(span.start).toBe((spans[i] as { end: number }).end);
    }
  });

  it("covers the soil with canopy while the crop grows and residue after, then bare", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    const cover = monthlyCover(
      entry("durum_wheat"),
      toDayNumber("2000-11-30"),
      spans,
      canopyCurve(wheat),
    );
    expect(cover[0]).toBe(0); // September, before sowing
    expect(Math.max(...cover)).toBeGreaterThan(0.6); // mid-season canopy
    expect(cover[cover.length - 1]).toBeLessThan(0.5); // August, long after harvest
    expect(groundCoverMonths(cover)).toBeGreaterThanOrEqual(5);
    for (const c of cover) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("gives fallow residue cover only for its pack cover months", () => {
    const fallow = monthlyCover(entry("fallow"), 0, spans, null);
    expect(groundCoverMonths(fallow)).toBe(0);
    expect(Math.max(...fallow)).toBe(0);
  });

  it("covers more for a larger Kc", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    const sow = toDayNumber("2000-11-30");
    const low = monthlyCover(entry("durum_wheat"), sow, spans, canopyCurve(wheat, 0.9));
    const high = monthlyCover(entry("durum_wheat"), sow, spans, canopyCurve(wheat, 1.1));
    expect(high.reduce((a, b) => a + b, 0)).toBeGreaterThan(low.reduce((a, b) => a + b, 0));
  });
});

describe("erosion", () => {
  it("grows with slope, never past 1, and is 0 on flat ground", () => {
    expect(slopeFactor(0)).toBeLessThan(0.07);
    expect(slopeFactor(3)).toBeGreaterThan(slopeFactor(1));
    expect(slopeFactor(45)).toBe(1);
  });

  it("is lower with more cover and bounded in [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 30, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 12, maxLength: 12 }),
        (slope, cover) => {
          const rain = { intensity: 0.7, monthlyShare: new Float64Array(12).fill(1 / 12) };
          const bare = erosionIndex(slopeFactor(slope), rain, new Array(12).fill(0));
          const covered = erosionIndex(slopeFactor(slope), rain, cover);
          expect(covered).toBeLessThanOrEqual(bare + 1e-12);
          expect(bare).toBeLessThanOrEqual(1);
          expect(covered).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("weights bare months by the share of rain they receive", () => {
    const rain = {
      intensity: 1,
      monthlyShare: Float64Array.from([0.9, ...new Array(11).fill(0.1 / 11)]),
    };
    const bareWetMonth = erosionIndex(1, rain, [0, ...new Array(11).fill(1)]);
    const bareDryMonth = erosionIndex(1, rain, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect(bareWetMonth).toBeGreaterThan(bareDryMonth * 5);
  });
});

describe("pests", () => {
  const seq = (...ids: string[]) => ids.map(entry);
  const pests = pack.pests;
  const free = (sequence: ReturnType<typeof seq>, position: number, risk = NEUTRAL) =>
    1 - pestPressure(pests, sequence, position, risk);

  it("is highest for the same host back to back and 0 for a crop no pest hosts", () => {
    expect(pestPressure(pests, seq("durum_wheat"), 0, NEUTRAL)).toBeGreaterThan(0.5);
    expect(pestPressure(pests, seq("fallow", "fallow"), 1, NEUTRAL)).toBe(0);
  });

  it("falls when a non-host break separates the hosts", () => {
    const continuous = pestPressure(pests, seq("durum_wheat"), 0, NEUTRAL);
    const withFallow = pestPressure(pests, seq("durum_wheat", "fallow"), 0, NEUTRAL);
    const withLegume = pestPressure(pests, seq("durum_wheat", "lentil", "lentil"), 0, NEUTRAL);
    expect(withFallow).toBeLessThan(continuous);
    expect(withLegume).toBeLessThan(continuous);
    expect(free(seq("durum_wheat", "fallow"), 0)).toBeGreaterThan(0);
  });

  it("scales with weather risk and stays in [0, 1]", () => {
    const sequence = seq("durum_wheat", "barley");
    const calm = pestPressure(pests, sequence, 0, { wet: 0.5, warm_dry: 0.5, none: 1 });
    const stormy = pestPressure(pests, sequence, 0, { wet: 1.5, warm_dry: 1.5, none: 1 });
    expect(stormy).toBeGreaterThanOrEqual(calm);
    for (const p of [calm, stormy]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("rates an average year 1 and keeps risks in [0.5, 1.5]", () => {
    const forcing = buildDailyForcing(makeBundle(8));
    const years = agriculturalYears(forcing, 9).filter((y) => y.usable);
    const risks = weatherRisks(forcing, years);
    expect(risks).toHaveLength(years.length);
    for (const r of risks) {
      for (const v of [r.wet, r.warm_dry]) {
        expect(v).toBeGreaterThanOrEqual(0.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
      expect(r.none).toBe(1);
    }
    expect(risks.some((r) => r.wet === 1)).toBe(true);
  });
});

describe("calendar", () => {
  const forcing = buildDailyForcing(makeBundle(3));
  const years = agriculturalYears(forcing, 9);

  it("labels agricultural years and marks full years usable", () => {
    expect(years.map((y) => y.label)).toEqual(["2000-01", "2001-02", "2002-03"]);
    expect(years.every((y) => y.usable)).toBe(true);
    expect(agriculturalYears(forcing, 1).map((y) => y.label)).toEqual([
      "2000",
      "2001",
      "2002",
      "2003",
    ]);
  });

  it("marks a partial year unusable", () => {
    const partial = agriculturalYears(forcing, 1);
    expect(partial[0]?.usable).toBe(false); // 2000 has only September to December
    expect(partial[3]?.usable).toBe(false); // 2003 has only January to August
  });

  it("puts autumn sowing in the starting year and spring sowing in the next calendar year", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    const chickpea = packCrop("dz-high-plains", "chickpea");
    const y = years[0] as (typeof years)[number];
    expect(sowingDayIn(wheat, y)).toBeGreaterThanOrEqual(y.startDay);
    expect(sowingDayIn(wheat, y)).toBeLessThan(y.endDay);
    const spring = sowingDayIn(chickpea, y);
    expect(spring).toBeGreaterThanOrEqual(y.startDay);
    expect(spring).toBeLessThan(y.endDay);
    expect(new Date(spring * 86_400_000).getUTCFullYear()).toBe(2001);
  });

  it("honors a day-of-year override on either side of the year start", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    const y = years[0] as (typeof years)[number];
    expect(sowingDayIn(wheat, y, 300)).toBe(toDayNumber("2000-01-01") + 299);
    expect(sowingDayIn(wheat, y, 40)).toBe(toDayNumber("2001-01-01") + 39);
  });
});

describe("resilience", () => {
  it("reports median, spread, worst and counts from season scores", () => {
    const r = resilience({
      composites: [0.5, 0.9, 0.7, 0.3, 0.6],
      severeWaterStress: [1, 0, 0, 1, 0],
      thermalHit: [0, 0, 1, 0, 0],
    });
    expect(r.median).toBe(0.6);
    expect(r.medianSeason).toBe(4);
    expect(r.worst).toBe(0.3);
    expect(r.p10).toBeCloseTo(0.38);
    expect(r.p90).toBeCloseTo(0.82);
    expect(r.severeWaterStressSeasons).toBe(2);
    expect(r.frostHeatHits).toBe(1);
  });

  it("keeps P10 <= median <= P90 for any number of seasons", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 30 }),
        (composites) => {
          const r = resilience({ composites, severeWaterStress: [], thermalHit: [] });
          expect(r.p10).toBeLessThanOrEqual(r.median);
          expect(r.median).toBeLessThanOrEqual(r.p90);
          expect(r.worst).toBeLessThanOrEqual(r.p10);
          expect(composites).toContain(r.median);
        },
      ),
    );
  });

  it("computes the win rate over common seasons only, strictly", () => {
    const base = new Map([
      ["a", 0.5],
      ["b", 0.5],
      ["c", 0.5],
    ]);
    expect(
      winRate(
        new Map([
          ["a", 0.6],
          ["b", 0.5],
          ["c", 0.4],
        ]),
        base,
      ),
    ).toBeCloseTo(1 / 3);
    expect(
      winRate(
        new Map([
          ["a", 0.6],
          ["z", 0.9],
        ]),
        base,
      ),
    ).toBe(1);
    expect(winRate(new Map([["z", 0.9]]), base)).toBeNull();
  });
});
