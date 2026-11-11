import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { et0Daily, extraterrestrialRadiation, saturationVapourPressure } from "../../src/physics";

describe("FAO-56 worked examples", () => {
  it("Example 18: Brussels, 6 July, daily (3.9 mm/day)", () => {
    const et0 = et0Daily({
      latitudeDeg: 50.8,
      elevationM: 100,
      doy: 187,
      tmax: 21.5,
      tmin: 12.3,
      rhMax: 84,
      rhMin: 63,
      wind2m: 2.078,
      srad: 22.07,
    });
    expect(Math.abs(et0 - 3.88)).toBeLessThan(0.1);
  });

  it("Example 17: Bangkok, April, monthly means (5.7 mm/day)", () => {
    const et0 = et0Daily({
      latitudeDeg: 13.73,
      elevationM: 2,
      doy: 105,
      tmax: 34.8,
      tmin: 25.6,
      tmean: 30.2,
      ea: 2.85,
      wind2m: 2,
      srad: 22.65,
      soilHeatFlux: 0.14,
    });
    expect(Math.abs(et0 - 5.72)).toBeLessThan(0.1);
  });

  it("matches the intermediate values of Example 18", () => {
    expect(saturationVapourPressure(21.5)).toBeCloseTo(2.564, 2);
    expect(saturationVapourPressure(12.3)).toBeCloseTo(1.431, 2);
    expect(extraterrestrialRadiation(50.8, 187)).toBeCloseTo(41.09, 1);
  });
});

describe("humidity inputs", () => {
  const base = {
    latitudeDeg: 36,
    elevationM: 900,
    doy: 120,
    tmax: 24,
    tmin: 10,
    wind2m: 2,
    srad: 20,
  };

  it("uses mean humidity (POWER RH2M) and is lower when the air is wetter", () => {
    const dry = et0Daily({ ...base, rhMean: 30 });
    const wet = et0Daily({ ...base, rhMean: 90 });
    expect(dry).toBeGreaterThan(wet);
  });

  it("falls back to a dew point near Tmin without any humidity", () => {
    const fallback = et0Daily(base);
    expect(fallback).toBeGreaterThan(0);
    expect(
      Math.abs(fallback - et0Daily({ ...base, ea: saturationVapourPressure(10) })),
    ).toBeLessThan(1e-9);
  });

  it("defaults the mean temperature to the average of the extremes", () => {
    expect(et0Daily({ ...base, rhMean: 50 })).toBeCloseTo(
      et0Daily({ ...base, rhMean: 50, tmean: 17 }),
      10,
    );
  });
});

describe("properties", () => {
  const day = fc
    .record({
      tmin: fc.double({ min: -30, max: 35, noNaN: true }),
      range: fc.double({ min: 0, max: 25, noNaN: true }),
      rhMean: fc.double({ min: 1, max: 100, noNaN: true }),
      wind2m: fc.double({ min: 0, max: 15, noNaN: true }),
      srad: fc.double({ min: 0, max: 35, noNaN: true }),
      elevationM: fc.double({ min: -100, max: 4500, noNaN: true }),
      latitudeDeg: fc.double({ min: -89, max: 89, noNaN: true }),
      doy: fc.integer({ min: 1, max: 366 }),
    })
    .map(({ range, ...rest }) => ({ ...rest, tmax: rest.tmin + range }));

  it("ET0 is finite and never negative", () => {
    fc.assert(
      fc.property(day, (d) => {
        const et0 = et0Daily(d);
        return Number.isFinite(et0) && et0 >= 0;
      }),
      { numRuns: 500 },
    );
  });

  it("more sun never lowers ET0", () => {
    fc.assert(
      fc.property(day, fc.double({ min: 0, max: 10, noNaN: true }), (d, extra) => {
        return et0Daily({ ...d, srad: d.srad + extra }) >= et0Daily(d) - 1e-9;
      }),
      { numRuns: 300 },
    );
  });

  it("extra-terrestrial radiation is never negative", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.integer({ min: 1, max: 366 }),
        (lat, doy) => extraterrestrialRadiation(lat, doy) >= -1e-9,
      ),
    );
  });
});
