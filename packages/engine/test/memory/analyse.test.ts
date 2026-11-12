import { describe, expect, it } from "vitest";
import { validate } from "../../src/contracts";
import type { SeasonLabel } from "../../src/memory";
import { analyseFieldMemory, DEFAULT_OPTIONS } from "../../src/memory";
import { analyseSeason } from "../../src/memory/seasons";
import { loadBundle } from "../physics/helpers";
import { KINDS_25, syntheticSources } from "./helpers";

describe("analyseFieldMemory on a synthetic 25-year record", () => {
  const input = {
    series: syntheticSources({
      kinds: KINDS_25,
      cloud: 0.1,
      hlsYears: 8,
      modisBias: { slope: 0.9, offset: 0.03 },
    }),
  };
  const result = analyseFieldMemory(input);

  it("labels at least 90 % of the seasons correctly", () => {
    expect(result.seasons).toHaveLength(25);
    const right = result.seasons.filter((s, i) => s.label === KINDS_25[i]).length;
    expect(right / 25).toBeGreaterThanOrEqual(0.9);
  });

  it("is deterministic", () => {
    expect(analyseFieldMemory(input)).toEqual(result);
  });

  it("recovers the MODIS to HLS bias over the overlap years", () => {
    expect(result.biasAdjustment?.slope).toBeCloseTo(1 / 0.9, 1);
    expect(result.biasAdjustment?.overlapPoints).toBeGreaterThan(50);
  });

  it("dates the crop cycle in the right order", () => {
    const wheat = result.phenology.find((p) => p.season === "2000-01");
    expect(wheat?.green_up && wheat.peak_date && wheat.senescence).toBeTruthy();
    expect((wheat?.green_up as string) < (wheat?.peak_date as string)).toBe(true);
    expect((wheat?.peak_date as string) < (wheat?.senescence as string)).toBe(true);
    expect(wheat?.peak_date?.slice(5, 7)).toBe("04");
    expect(wheat?.inferred.crop).toBe("winter_crop");
  });

  it("emits phenology that satisfies the bundle contract", () => {
    const bundle = { ...loadBundle("fallow-heavy"), phenology: result.phenology };
    const check = validate("field-bundle", bundle);
    expect(check.ok ? [] : check.errors).toEqual([]);
  });

  it("reports bare windows per season and as a month by year matrix", () => {
    expect(result.bareMatrix.months[0]).toBe(9);
    expect(result.bareMatrix.rows).toHaveLength(25);
    const fallow = result.seasons.findIndex((s) => s.label === "fallow_or_bare");
    expect(result.seasons[fallow]?.bareDays).toBeGreaterThan(30);
    const row = result.bareMatrix.rows[fallow]?.bareShare ?? [];
    expect(row).toHaveLength(12);
    expect(row.some((v) => v != null && v > 0.5)).toBe(true);
  });

  it("infers the fallow rotation baseline and the structured insights", () => {
    expect(result.insights.seasonsAnalysed).toBe(25);
    expect(result.insights.fallowSeasons).toBe(
      KINDS_25.filter((k) => k === "fallow_or_bare").length,
    );
    expect(result.insights.avgBareMonthsPerYear).toBeGreaterThan(1);
    expect(result.rotation.kind).toBe("fallow_rotation");
    expect(result.rotation.pattern).toEqual(["winter_crop", "fallow_or_bare"]);
  });

  it("reports only runs the interpolation could not bridge as gaps", () => {
    expect(result.gaps.every((g) => g.days >= 32)).toBe(true);
  });
});

describe("gaps and degraded input", () => {
  it("does not throw on empty, static or all-masked input", () => {
    expect(analyseFieldMemory({ series: [] }).seasons).toEqual([]);
    const masked = {
      sensor: "modis" as const,
      cadence: "16day" as const,
      start: "2020-09-01",
      values: [0.3, 0.4],
      quality: [2, 2],
    };
    expect(analyseFieldMemory({ series: [masked] }).seasons).toEqual([]);
    expect(
      analyseFieldMemory({ series: [{ ...masked, cadence: "static" }] }).insights.seasonsAnalysed,
    ).toBe(0);
  });

  it("marks a season with a long gap as insufficient and reports the gap", () => {
    const [modis] = syntheticSources({ kinds: ["winter_crop", "winter_crop", "winter_crop"] });
    const cut = { ...modis, values: modis.values.slice(), quality: modis.quality.slice() };
    for (let i = 30; i < 60; i++) {
      cut.values[i] = null;
      cut.quality[i] = 2;
    }
    const r = analyseFieldMemory({ series: [cut] });
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.gaps[0]?.days).toBeGreaterThan(32);
    expect(r.seasons.some((s) => s.insufficient)).toBe(true);
    expect(r.insights.seasonsInsufficient).toBeGreaterThan(0);
    expect(r.seasons.find((s) => s.insufficient)?.phenology.inferred.confidence).toBe("low");
  });

  it("falls back to the default calendar for an invalid start month", () => {
    const sources = syntheticSources({ kinds: ["winter_crop", "fallow_or_bare", "winter_crop"] });
    const a = analyseFieldMemory({ series: sources, calendar: { agriculturalYearStartMonth: 13 } });
    expect(a.seasons[0]?.phenology.season).toBe("2000-01");
  });

  it("supports a January start and a 5-step window", () => {
    const sources = syntheticSources({ kinds: ["winter_crop", "winter_crop", "winter_crop"] });
    const r = analyseFieldMemory({
      series: sources,
      calendar: { agriculturalYearStartMonth: 1 },
      options: { smoothingWindow: 5 },
    });
    expect(r.seasons[0]?.phenology.season).toBe("2001");
    expect(r.bareMatrix.months[0]).toBe(1);
  });

  it("lowers confidence and records deltas when MCD12Q2 disagrees", () => {
    const sources = syntheticSources({ kinds: ["winter_crop", "winter_crop", "winter_crop"] });
    const base = analyseFieldMemory({ series: sources });
    const wheat = base.phenology[0];
    const disagree = analyseFieldMemory({
      series: sources,
      reference: [
        { season: "2000-01", peak_date: "2001-07-15" },
        { season: "2001-02", peak_date: wheat?.peak_date?.replace("2001", "2002") as string },
      ],
    });
    expect(disagree.seasons[0]?.crossCheck?.agrees).toBe(false);
    expect(disagree.seasons[0]?.crossCheck?.deltaDays.peak_date).toBeLessThan(-30);
    expect(disagree.seasons[1]?.crossCheck?.agrees).toBe(true);
    const order = ["low", "medium", "high"];
    expect(
      order.indexOf(disagree.seasons[0]?.phenology.inferred.confidence as string),
    ).toBeLessThan(order.indexOf(base.seasons[0]?.phenology.inferred.confidence as string));
    expect(disagree.seasons[2]?.crossCheck).toBeUndefined();
  });

  it("labels a mid-winter peak uncertain with low confidence", () => {
    // Peak in December (about 100 days after 1 September) matches neither crop window.
    const start = Date.UTC(2000, 8, 1);
    const values: number[] = [];
    for (let i = 0; i < 23; i++) values.push(0.15 + 0.55 * Math.exp(-(((i * 16 - 100) / 45) ** 2)));
    const r = analyseFieldMemory({
      series: [
        {
          sensor: "modis",
          cadence: "16day",
          start: new Date(start).toISOString().slice(0, 10),
          values,
          quality: values.map(() => 0),
        },
      ],
      reference: [],
    });
    expect(r.seasons[0]?.label).toBe("uncertain");
    expect(r.seasons[0]?.phenology.inferred.confidence).toBe("low");
  });

  it("labels a sparsely observed season from its own data, not the other years", () => {
    const kinds = Array.from(
      { length: 11 },
      (_, i): SeasonLabel => (i === 5 ? "fallow_or_bare" : "winter_crop"),
    );
    const [modis] = syntheticSources({ kinds, seed: 3 });
    const values = modis.values.slice();
    const quality = modis.quality.slice();
    // Season 5 seen only in bursts of three composites, too short for Savitzky-Golay.
    for (let i = 114; i < 138; i++) {
      if (i % 7 > 2) {
        values[i] = null;
        quality[i] = 2;
      }
    }
    const r = analyseFieldMemory({
      series: [{ ...modis, values, quality }],
      options: { minCoverage: 0.3 },
    });
    expect(r.seasons[5]?.label).toBe("fallow_or_bare");
    expect(r.seasons[5]?.phenology.peak_ndvi).toBeLessThan(0.35);
  });

  it("leaves green-up undated when its crossing falls inside a gap", () => {
    const g0 = Date.UTC(2000, 8, 1) / 86_400_000;
    const values: (number | null)[] = [];
    for (let i = 0; i < 46; i++)
      values.push(i < 10 ? 0.1 : i < 15 ? null : 0.3 + 0.4 * Math.exp(-(((i - 25) / 6) ** 2)));
    const { result } = analyseSeason(
      { g0, values, flags: values.map((v) => (v == null ? 2 : 0)) },
      { id: "2000-01", start: g0, end: g0 + 364 },
      0.2,
      { ...DEFAULT_OPTIONS, minCoverage: 0.5 },
    );
    expect(result.label).toBe("winter_crop");
    expect(result.phenology.green_up).toBeUndefined();
    expect(result.phenology.senescence).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
