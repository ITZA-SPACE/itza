import { describe, expect, it } from "vitest";
import type { FieldBundle } from "../../src/contracts";
import {
  buildDailyForcing,
  derivedProvenance,
  fromDayNumber,
  toDayNumber,
  toIsoDate,
} from "../../src/physics";
import { loadBundle } from "./helpers";

const clone = (b: FieldBundle) => structuredClone(b);

describe("buildDailyForcing", () => {
  it("rejects missing elevation instead of treating it as sea level", () => {
    const missing = structuredClone(bundle);
    missing.field.elevation_m = null;
    expect(() => buildDailyForcing(missing)).toThrow("Bundle lacks elevation");
  });

  const bundle = loadBundle("semi-arid-winter-cereal");

  it("builds three years of daily forcing with plausible ET0", () => {
    const f = buildDailyForcing(bundle);
    expect(f.days).toBe(1096);
    expect(toIsoDate(f.startDay)).toBe("2021-09-01");
    expect(f.gaps).toEqual({ temperature: 0, precip: 0, et0: 0 });
    expect(Array.from(f.et0).every((v) => v >= 0 && v < 12)).toBe(true);
    const mean = f.et0.reduce((a, b) => a + b, 0) / f.days;
    expect(mean).toBeGreaterThan(2);
    expect(mean).toBeLessThan(6);
    expect(f.latitudeDeg).toBeCloseTo(36.12);
    expect(f.elevationM).toBe(980);
    expect(f.observed.every((v) => v === 1)).toBe(true);
  });

  it("records provenance derived from every input series", () => {
    const f = buildDailyForcing(bundle);
    expect(f.provenance.derived_from).toEqual(["nasa_power_daily"]);
    expect(f.provenance.period).toEqual({ start: "2021-09-01", end: "2024-08-31" });
  });

  it("fills gaps by the documented policy and counts them", () => {
    const gapped = clone(bundle);
    const set = (name: string, i: number) => {
      const s = gapped.series.find((x) => x.var === name) as {
        values: (number | null)[];
        quality: number[];
      };
      s.values[i] = null;
      s.quality[i] = 2;
    };
    set("precip", 3);
    set("tmax", 10);
    set("srad", 20);
    const f = buildDailyForcing(gapped);
    expect(f.gaps).toEqual({ temperature: 1, precip: 1, et0: 2 });
    expect(f.precip[3]).toBe(0);
    expect(f.tmax[10]).toBe(f.tmax[9]);
    expect(f.observed[3]).toBe(0);
    expect(f.observed[10]).toBe(0);
    expect(f.observed[20]).toBe(1);
    const clean = buildDailyForcing(bundle);
    expect(Math.abs((f.et0[20] as number) - (clean.et0[20] as number))).toBeLessThan(2); // climatological fill
  });

  it("works without relative humidity or mean temperature", () => {
    const sparse = clone(bundle);
    sparse.series = sparse.series.filter((s) => s.var !== "rh" && s.var !== "tmean");
    const f = buildDailyForcing(sparse);
    expect(f.gaps.et0).toBe(0);
    expect(f.et0[0]).toBeGreaterThan(0);
  });

  it("uses the shared span of the series", () => {
    const shifted = clone(bundle);
    const tmax = shifted.series.find((s) => s.var === "tmax") as {
      start: string;
      values: (number | null)[];
      quality: number[];
    };
    tmax.start = "2021-09-11";
    tmax.values = tmax.values.slice(0, 1000);
    tmax.quality = tmax.quality.slice(0, 1000);
    const f = buildDailyForcing(shifted);
    expect(toIsoDate(f.startDay)).toBe("2021-09-11");
    expect(f.days).toBe(1000);
  });

  it("rejects a bundle without the required series, or with no overlap", () => {
    const missing = clone(bundle);
    missing.series = missing.series.filter((s) => s.var !== "precip" && s.var !== "srad");
    expect(() => buildDailyForcing(missing)).toThrow("precip, srad");
    const apart = clone(bundle);
    (apart.series.find((s) => s.var === "tmax") as { start: string }).start = "2030-01-01";
    expect(() => buildDailyForcing(apart)).toThrow("do not overlap");
  });

  it("fills ET0 with the overall mean when no day has all inputs", () => {
    const broken = clone(bundle);
    const srad = broken.series.find((s) => s.var === "srad") as {
      values: (number | null)[];
      quality: number[];
    };
    srad.values = srad.values.map(() => null);
    srad.quality = srad.quality.map(() => 2);
    const f = buildDailyForcing(broken);
    expect(f.gaps.et0).toBe(f.days);
    expect(f.et0.every((v) => v === 0)).toBe(true);
  });
});

describe("derivedProvenance", () => {
  it("takes the coarsest resolution, lowest quality and every source including segments", () => {
    const bundle = loadBundle("semi-arid-winter-cereal");
    const precip = clone(bundle).series.find((s) => s.var === "precip");
    if (!precip) throw new Error("fixture");
    precip.segments = [{ start: "2022-01-01", source: "gpm_imerg_late_daily" }];
    precip.provenance.quality = "low";
    const tmax = bundle.series.find((s) => s.var === "tmax");
    if (!tmax) throw new Error("fixture");
    const p = derivedProvenance(
      [precip, tmax],
      "Test",
      { start: "2021-09-01", end: "2022-08-31" },
      "test",
    );
    expect(p.derived_from).toEqual(["gpm_imerg_late_daily", "nasa_power_daily"]);
    expect(p.quality).toBe("low");
    expect(p.source).toBe("itza_engine");
  });
});

describe("dates", () => {
  it("round-trips day numbers and handles leap years", () => {
    const day = toDayNumber("2024-02-29");
    expect(fromDayNumber(day)).toEqual({ year: 2024, month: 2, day: 29, doy: 60 });
    expect(toIsoDate(day + 1)).toBe("2024-03-01");
    expect(fromDayNumber(toDayNumber("2023-12-31")).doy).toBe(365);
  });
});
