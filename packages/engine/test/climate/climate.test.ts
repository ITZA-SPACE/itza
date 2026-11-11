import { describe, expect, it } from "vitest";
import {
  climateFingerprint,
  detectWorstSeasons,
  type SeasonIndicators,
  zScores,
} from "../../src/climate";
import type { FieldBundle } from "../../src/contracts";
import { loadBundle } from "../physics/helpers";

const clone = (b: FieldBundle) => structuredClone(b);

/** A bundle whose daily series are replaced by simple known patterns (3 agricultural years). */
function patterned(
  fill: (i: number) => { tmax: number; tmin: number; precip: number },
  base = loadBundle("semi-arid-winter-cereal"),
): FieldBundle {
  const bundle = clone(base);
  for (const s of bundle.series) {
    if (s.cadence !== "daily") continue;
    if (s.var === "tmax" || s.var === "tmin" || s.var === "precip") {
      s.values = s.values.map((_, i) => fill(i)[s.var as "tmax" | "tmin" | "precip"]);
      s.quality = s.values.map(() => 0);
    }
  }
  return bundle;
}

describe("both synthetic fixtures", () => {
  for (const name of ["semi-arid-winter-cereal", "fallow-heavy"] as const) {
    describe(name, () => {
      const fp = climateFingerprint(loadBundle(name), { yearStartMonth: 9 });

      it("computes indicators for every season, labeled like the phenology seasons", () => {
        expect(fp.seasons.map((s) => s.label)).toEqual(["2021-22", "2022-23", "2023-24"]);
        expect(fp.seasons.every((s) => s.usable && s.coverage === 1)).toBe(true);
        for (const s of fp.seasons) {
          expect(s.rainMm).toBeGreaterThan(0);
          expect(s.et0Mm).toBeGreaterThan(500);
          expect(s.longestDrySpellDays).toBeGreaterThan(0);
          expect(s.heatDays30).toBeGreaterThanOrEqual(s.heatDays35);
          expect(s.frostDays0).toBeGreaterThanOrEqual(s.frostDays2);
          expect(s.rainMinusEt0Mm).toBeCloseTo(s.rainMm - s.et0Mm, 6);
          expect(s.soilMoistureZ).not.toBeNull();
        }
      });

      it("splits each season into 12 months that add up to the season", () => {
        for (const s of fp.seasons) {
          expect(s.months).toHaveLength(12);
          expect(s.months[0]?.label).toBe(s.period.start.slice(0, 7));
          expect(s.months.reduce((a, m) => a + m.rainMm, 0)).toBeCloseTo(s.rainMm, 6);
          expect(s.months.reduce((a, m) => a + m.et0Mm, 0)).toBeCloseTo(s.et0Mm, 6);
          expect(s.months.reduce((a, m) => a + m.gdd, 0)).toBeCloseTo(s.gdd, 6);
          expect(s.months.every((m) => m.soilMoistureZ !== null)).toBe(true);
        }
      });

      it("lists worst seasons with their anomaly", () => {
        const rain = fp.worst.lowest_rain;
        expect(rain).toHaveLength(3);
        expect(rain[0]?.value).toBe(Math.min(...fp.seasons.map((s) => s.rainMm)));
        expect(rain[0]?.deviation).toBeLessThan(0);
        expect(rain[0]?.z).toBeLessThan(0);
        const soil = fp.worst.driest_soil[0];
        expect(soil?.value).toBe(Math.min(...fp.seasons.map((s) => s.soilMoistureZ as number)));
        expect(fp.worst.highest_heat.length).toBeGreaterThan(0);
        for (const list of Object.values(fp.worst)) {
          for (const item of list) expect(fp.seasons.map((s) => s.label)).toContain(item.season);
        }
      });

      it("records provenance derived from the input series", () => {
        for (const s of fp.seasons) {
          expect(s.provenance.derived_from).toEqual(
            expect.arrayContaining(["nasa_power_daily", "smap_l4"]),
          );
          expect(s.provenance.period).toEqual(s.period);
          expect(s.provenance.resolution_m).toBeGreaterThanOrEqual(55000);
          for (const m of s.months) expect(m.provenance.derived_from).toContain("nasa_power_daily");
        }
      });
    });
  }
});

describe("indicator definitions on known data", () => {
  // Days since 2021-09-01. Rain 10 mm on day 3 and 20 mm on day 10; frost on days 5 and 6; heat on day 8.
  const bundle = patterned((i) => ({
    tmax: i === 8 ? 36 : 20,
    tmin: i === 5 ? -3 : i === 6 ? -1 : 8,
    precip: i === 3 ? 10 : i === 10 ? 20 : 0,
  }));
  const fp = climateFingerprint(bundle, {
    yearStartMonth: 9,
    gddBaseC: 5,
    crop: { frostC: 0, heatC: 35 },
  });
  const first = fp.seasons[0] as SeasonIndicators;

  it("counts rain, intensity and the longest dry spell", () => {
    const sep = first.months[0];
    expect(sep?.rainMm).toBe(30);
    expect(sep?.maxDailyRainMm).toBe(20);
    expect(sep?.longestDrySpellDays).toBe(19); // days 11 to 29 of September
  });

  it("counts frost and heat days against 0, -2, 30, 35 and the crop limits", () => {
    const sep = first.months[0];
    expect(sep?.frostDays0).toBe(2);
    expect(sep?.frostDays2).toBe(1);
    expect(sep?.heatDays30).toBe(1);
    expect(sep?.heatDays35).toBe(1);
    expect(sep?.cropFrostDays).toBe(2);
    expect(sep?.cropHeatDays).toBe(1);
  });

  it("adds growing degree days above the base", () => {
    const sep = first.months[0];
    // 27 ordinary days: (20 + 8) / 2 - 5 = 9; day 5: (20 + 5) / 2 - 5 = 7.5; day 6: (20+5)/2-5 = 7.5;
    // day 8: (36 + 8) / 2 - 5 = 17.
    expect(sep?.gdd).toBeCloseTo(27 * 9 + 7.5 + 7.5 + 17, 6);
  });

  it("omits crop counts without crop limits", () => {
    const plain = climateFingerprint(bundle, { yearStartMonth: 9 });
    expect(plain.seasons[0]?.cropFrostDays).toBeUndefined();
  });
});

describe("gaps and sources", () => {
  it("lowers coverage, drops unusable seasons from the ranking and keeps going", () => {
    const bundle = clone(loadBundle("semi-arid-winter-cereal"));
    const tmax = bundle.series.find((s) => s.var === "tmax");
    // Remove 20% of the second season.
    const from = 365;
    for (let i = from; i < from + 80; i++) {
      (tmax as { values: (number | null)[] }).values[i] = null;
      (tmax as { quality: number[] }).quality[i] = 2;
    }
    const fp = climateFingerprint(bundle, { yearStartMonth: 9 });
    const second = fp.seasons[1] as SeasonIndicators;
    expect(second.coverage).toBeLessThan(0.9);
    expect(second.usable).toBe(false);
    expect(fp.worst.lowest_rain.map((w) => w.season)).not.toContain(second.label);
    expect(fp.worst.lowest_rain).toHaveLength(2);
    expect(second.months.some((m) => m.coverage < 1)).toBe(true);
  });

  it("follows precipitation source switches per day", () => {
    const bundle = clone(loadBundle("semi-arid-winter-cereal"));
    const precip = bundle.series.find((s) => s.var === "precip");
    (precip as { segments?: { start: string; source: string }[] }).segments = [
      { start: "2021-09-01", source: "gpm_imerg_final_daily" },
      { start: "2022-03-01", source: "gpm_imerg_late_daily" },
    ];
    const fp = climateFingerprint(bundle, { yearStartMonth: 9 });
    const first = fp.seasons[0] as SeasonIndicators;
    expect(first.precipSourceDays).toEqual({
      gpm_imerg_final_daily: 181,
      gpm_imerg_late_daily: 184,
    });
    expect(first.provenance.derived_from).toEqual(
      expect.arrayContaining(["gpm_imerg_final_daily", "gpm_imerg_late_daily"]),
    );
  });

  it("runs without soil moisture and returns null anomalies", () => {
    const bundle = clone(loadBundle("semi-arid-winter-cereal"));
    bundle.series = bundle.series.filter((s) => s.var !== "sm_rootzone");
    const fp = climateFingerprint(bundle, { yearStartMonth: 9 });
    expect(fp.seasons.every((s) => s.soilMoisture === null && s.soilMoistureZ === null)).toBe(true);
    expect(fp.worst.driest_soil).toEqual([]);
  });

  it("labels calendar-year seasons by year and rejects a bad start month", () => {
    const fp = climateFingerprint(loadBundle("fallow-heavy"), { yearStartMonth: 1 });
    expect(fp.seasons.map((s) => s.label)).toEqual(["2021", "2022", "2023", "2024"]);
    expect(fp.seasons[0]?.usable).toBe(false); // starts on 1 September
    expect(() => climateFingerprint(loadBundle("fallow-heavy"), { yearStartMonth: 13 })).toThrow(
      RangeError,
    );
    expect(() => climateFingerprint(loadBundle("fallow-heavy"), { yearStartMonth: 1.5 })).toThrow(
      RangeError,
    );
  });
});

describe("zScores and worst seasons", () => {
  it("needs three values and handles flat samples", () => {
    expect(zScores([1, 2])).toEqual([null, null]);
    expect(zScores([5, 5, 5])).toEqual([0, 0, 0]);
    expect(zScores([1, null, 2, 3])[1]).toBeNull();
    const z = zScores([1, 2, 3]);
    expect(z[0]).toBeCloseTo(-1);
    expect(z[2]).toBeCloseTo(1);
  });

  it("returns nothing when there are no usable seasons", () => {
    expect(detectWorstSeasons([])).toEqual({
      lowest_rain: [],
      highest_heat: [],
      driest_soil: [],
      worst_frost: [],
    });
  });

  it("ranks only seasons that have the hazard, hard frost counting twice", () => {
    const cold = patterned((i) => ({
      tmax: 15,
      tmin: i >= 365 && i < 370 ? -4 : i >= 730 && i < 735 ? -1 : 5,
      precip: 0,
    }));
    const fp = climateFingerprint(cold, { yearStartMonth: 9 });
    expect(fp.worst.worst_frost.map((w) => [w.season, w.value])).toEqual([
      ["2022-23", 10],
      ["2023-24", 5],
    ]);
    // No day above 30 C anywhere, so there is no heat ranking either.
    expect(fp.worst.highest_heat).toEqual([]);
  });

  it("is deterministic", () => {
    const a = climateFingerprint(loadBundle("semi-arid-winter-cereal"), { yearStartMonth: 9 });
    const b = climateFingerprint(loadBundle("semi-arid-winter-cereal"), { yearStartMonth: 9 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
