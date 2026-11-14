import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BARE_PROFILE_M,
  type CropSegment,
  type DayWater,
  type HydrologicGroup,
  initialWaterState,
  type SoilParams,
  type Surface,
  scsRunoff,
  simulateTimeline,
  soilParams,
  stepWaterBalance,
  toDayNumber,
  type WaterState,
} from "../../src/physics";
import { loadBundle, packCrop } from "./helpers";

const soil = (awcMmPerM: number, group: HydrologicGroup = "B"): SoilParams => ({
  texture: "loam",
  assumedTexture: false,
  awcMmPerM,
  hydrologicGroup: group,
  rewMm: 9,
  tewMm: 20,
});

describe("FAO-56 chapter 8 reference cases", () => {
  it("Example 36: TAW for onion, tomato and maize on three soils (mm, tolerance 1)", () => {
    const soils = { loamySand: 90, silt: 170, siltyClay: 120 };
    const crops = { onion: 0.4, tomato: 0.8, maize: 1.2 };
    const expected = {
      onion: [36, 68, 48],
      tomato: [72, 136, 96],
      maize: [108, 204, 144],
    } as const;
    for (const [crop, zr] of Object.entries(crops)) {
      Object.values(soils).forEach((awc, i) => {
        const { flux } = stepWaterBalance(
          { dr: 0, zr, de: 0 },
          soil(awc),
          { precip: 0, et0: 0 },
          { type: "crop", kc: 1, zr, p: 0.5 },
        );
        expect(
          Math.abs(flux.taw - expected[crop as keyof typeof expected][i]!),
        ).toBeLessThanOrEqual(1);
      });
    }
  });

  it("Example 37: Ks and ETc adj of tomato over 10 days (Ks within 0.01, Dr within 0.2 mm)", () => {
    // Table of the example: Dr at the end of each day and Ks of each day.
    const table = [
      [1.0, 61.0],
      [1.0, 67.0],
      [0.97, 72.8],
      [0.91, 78.3],
      [0.85, 83.4],
      [0.8, 88.2],
      [0.75, 92.6],
      [0.7, 96.9],
      [0.66, 100.8],
      [0.62, 104.5],
    ] as const;
    // theta FC 0.32, WP 0.12: 200 mm/m, Zr 0.8 m: TAW 160 mm, RAW 64 mm with p 0.4.
    let state: WaterState = { dr: 55, zr: 0.8, de: 0 };
    const surface: Surface = { type: "crop", kc: 1.2, zr: 0.8, p: 0.4 };
    table.forEach(([ks, drEnd], day) => {
      const step = stepWaterBalance(state, soil(200), { precip: 0, et0: 5 }, surface, {
        adjustDepletionFraction: false,
      });
      state = step.state;
      expect(Math.abs(step.flux.ks - ks), `Ks day ${day + 1}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(state.dr - drEnd), `Dr day ${day + 1}`).toBeLessThanOrEqual(0.2);
      expect(step.flux.deepPercolation).toBe(0);
    });
  });

  it("Example 38: irrigation that refills the root zone gives no deep percolation", () => {
    // Day 10 of the example: Dr 0 at the start is not it; use Dr 27 and 27 mm of irrigation.
    const step = stepWaterBalance(
      { dr: 27, zr: 0.35, de: 0 },
      soil(130),
      { precip: 0, et0: 0, irrigation: 27 },
      { type: "crop", kc: 1, zr: 0.35, p: 0.6 },
    );
    expect(step.flux.deepPercolation).toBeCloseTo(0, 6);
    expect(step.state.dr).toBeCloseTo(0, 6);
  });
});

describe("runoff", () => {
  it("is zero below the initial abstraction and grows with rain", () => {
    expect(scsRunoff(0, "B", 0, 0.5)).toBe(0);
    expect(scsRunoff(5, "B", 0, 0.5)).toBe(0);
    expect(scsRunoff(60, "B", 0, 0.5)).toBeGreaterThan(scsRunoff(30, "B", 0, 0.5));
  });

  it("is higher on heavier soils, bare soil and wet soil", () => {
    expect(scsRunoff(40, "D", 0, 0.5)).toBeGreaterThan(scsRunoff(40, "A", 0, 0.5));
    expect(scsRunoff(40, "B", 0, 0.5)).toBeGreaterThan(scsRunoff(40, "B", 1, 0.5));
    expect(scsRunoff(40, "B", 0.5, 1)).toBeGreaterThan(scsRunoff(40, "B", 0.5, 0));
  });

  it("never exceeds the rain", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.constantFrom<HydrologicGroup>("A", "B", "C", "D"),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (p, g, cover, wet) => {
          const q = scsRunoff(p, g, cover, wet);
          return q >= 0 && q <= p + 1e-9;
        },
      ),
    );
  });
});

describe("bare fallow", () => {
  it("evaporates fast after rain, then slows as the topsoil dries", () => {
    let state: WaterState = { dr: 60, zr: BARE_PROFILE_M, de: 20 };
    const s = soil(150);
    const wet = stepWaterBalance(state, s, { precip: 30, et0: 5 }, { type: "bare" });
    state = wet.state;
    const first = wet.flux.eta;
    let last = first;
    for (let i = 0; i < 12; i++) {
      const step = stepWaterBalance(state, s, { precip: 0, et0: 5 }, { type: "bare" });
      state = step.state;
      last = step.flux.eta;
    }
    expect(first).toBeGreaterThan(5);
    expect(last).toBeLessThan(first / 2);
  });

  it("stores rain in the profile and drains the excess", () => {
    const s = soil(150);
    const wet = stepWaterBalance(
      { dr: 20, zr: BARE_PROFILE_M, de: 20 },
      s,
      { precip: 100, et0: 0 },
      { type: "bare" },
    );
    expect(wet.flux.deepPercolation).toBeGreaterThan(0);
    expect(wet.state.dr).toBe(0);
  });
});

describe("properties of one step", () => {
  const stateArb = fc.record({
    dr: fc.double({ min: 0, max: 400, noNaN: true }),
    de: fc.double({ min: 0, max: 20, noNaN: true }),
  });
  const dayArb = fc.record({
    precip: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 150, noNaN: true })),
    et0: fc.double({ min: 0, max: 12, noNaN: true }),
    irrigation: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true })),
  });
  const surfaceArb: fc.Arbitrary<Surface> = fc.oneof(
    fc.constant<Surface>({ type: "bare" }),
    fc.record({
      type: fc.constant("crop" as const),
      kc: fc.double({ min: 0.1, max: 1.3, noNaN: true }),
      zr: fc.double({ min: 0.05, max: 2, noNaN: true }),
      p: fc.double({ min: 0.1, max: 0.8, noNaN: true }),
    }),
  );
  const soilArb = fc.record({
    awc: fc.double({ min: 40, max: 220, noNaN: true }),
    group: fc.constantFrom<HydrologicGroup>("A", "B", "C", "D"),
  });

  it("keeps depletion within [0, TAW], Ks within [0, 1] and conserves water", () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.double({ min: 0.05, max: 2, noNaN: true }),
        dayArb,
        surfaceArb,
        soilArb,
        fc.boolean(),
        (st, zr0, day, surface, sp, adjust) => {
          const s = soil(sp.awc, sp.group);
          const state: WaterState = { dr: Math.min(st.dr, s.awcMmPerM * zr0), zr: zr0, de: st.de };
          const { state: next, flux } = stepWaterBalance(state, s, day as DayWater, surface, {
            adjustDepletionFraction: adjust,
          });
          const taw = flux.taw;
          const zr = surface.type === "crop" ? surface.zr : BARE_PROFILE_M;
          const rescaled = Math.min(taw, Math.max(0, (state.dr / (s.awcMmPerM * zr0)) * taw));
          const balance =
            rescaled -
            (day.precip - flux.runoff) -
            day.irrigation +
            flux.eta +
            flux.deepPercolation;
          return (
            next.dr >= -1e-9 &&
            next.dr <= taw + 1e-9 &&
            flux.ks >= -1e-9 &&
            flux.ks <= 1 + 1e-9 &&
            flux.eta >= -1e-9 &&
            flux.eta <= flux.etc + 1e-9 &&
            flux.runoff >= 0 &&
            flux.runoff <= day.precip + 1e-9 &&
            flux.deepPercolation >= 0 &&
            Math.abs(next.dr - balance) < 1e-6 &&
            next.de >= -1e-9 &&
            next.de <= s.tewMm + 1e-9
          );
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("timeline", () => {
  const bundle = loadBundle("semi-arid-winter-cereal");
  const s = soilParams(bundle.soil);
  const wheat = packCrop("dz-high-plains", "bread_wheat");
  const start = toDayNumber("2021-09-01");
  const days = 365;
  // Deterministic weather: 8 mm every fifth day in winter, none in summer; ET0 follows the season.
  const precip = Float64Array.from({ length: days }, (_, i) => (i % 5 === 0 && i < 240 ? 8 : 0));
  const et0 = Float64Array.from(
    { length: days },
    (_, i) => 1.5 + 4 * Math.sin((Math.PI * (i + 100)) / 365) ** 2,
  );

  it("simulates a season, with bare fallow around it", () => {
    const sowingDay = toDayNumber("2021-11-30");
    const result = simulateTimeline({
      startDay: start,
      precip,
      et0,
      soil: s,
      segments: [{ crop: wheat, sowingDay }],
    });
    expect(result.segments).toHaveLength(1);
    const seg = result.segments[0]!;
    expect(seg.cropId).toBe("bread_wheat");
    expect(seg.complete).toBe(true);
    expect(seg.endDay - seg.sowingDay + 1).toBe(180);
    expect(seg.wsi).toBeGreaterThanOrEqual(0);
    expect(seg.wsi).toBeLessThanOrEqual(1);
    expect(seg.etaMm).toBeLessThanOrEqual(seg.etcMm);
    expect(result.stage[0]).toBe(-1);
    expect(result.stage[sowingDay - start]).toBe(0);
    expect(result.stage[sowingDay - start + 100]).toBe(2);
    expect(result.stage.at(-1)).toBe(-1);
  });

  it("stresses a crop more in a dry year than in a wet one", () => {
    const sowingDay = toDayNumber("2021-11-30");
    const run = (scale: number) =>
      simulateTimeline({
        startDay: start,
        precip: precip.map((p) => p * scale),
        et0,
        soil: s,
        segments: [{ crop: wheat, sowingDay }],
      }).segments[0]!;
    expect(run(0.2).wsi).toBeGreaterThan(run(3).wsi);
    expect(run(0.2).stressDays).toBeGreaterThan(run(3).stressDays);
  });

  it("clips a season that runs past the forcing and flags it incomplete", () => {
    const result = simulateTimeline({
      startDay: start,
      precip,
      et0,
      soil: s,
      segments: [{ crop: wheat, sowingDay: start + 300 }],
    });
    expect(result.segments[0]?.complete).toBe(false);
  });

  it("starts with the crop root zone when the first sowing is on day 0", () => {
    const result = simulateTimeline({
      startDay: start,
      precip,
      et0,
      soil: s,
      segments: [{ crop: wheat, sowingDay: start }],
      initialDepletionFraction: 0,
    });
    expect(result.segments[0]?.startDr).toBeLessThan(10);
  });

  it("runs back-to-back seasons", () => {
    const first: CropSegment = { crop: wheat, sowingDay: start };
    const second: CropSegment = { crop: wheat, sowingDay: start + 180 };
    const result = simulateTimeline({
      startDay: start,
      precip,
      et0,
      soil: s,
      segments: [second, first],
    });
    expect(result.segments.map((x) => x.sowingDay)).toEqual([start, start + 180]);
    expect(result.segments.every((x) => x.complete)).toBe(true);
  });

  it("rejects overlapping seasons and mismatched arrays", () => {
    const a: CropSegment = { crop: wheat, sowingDay: start };
    const b: CropSegment = { crop: wheat, sowingDay: start + 100 };
    expect(() =>
      simulateTimeline({ startDay: start, precip, et0, soil: s, segments: [a, b] }),
    ).toThrow("overlap");
    expect(() =>
      simulateTimeline({ startDay: start, precip, et0: et0.slice(1), soil: s, segments: [] }),
    ).toThrow(RangeError);
  });

  it("adds irrigation to the balance", () => {
    const irrigation = new Float64Array(days).fill(2);
    const dry = new Float64Array(days);
    const sowingDay = toDayNumber("2021-11-30");
    const run = (irr?: Float64Array) =>
      simulateTimeline({
        startDay: start,
        precip: dry,
        et0,
        soil: s,
        segments: [{ crop: wheat, sowingDay }],
        ...(irr ? { irrigation: irr } : {}),
      }).segments[0]!;
    expect(run(irrigation).wsi).toBeLessThan(run().wsi);
  });

  it("keeps every daily series inside its bounds", () => {
    const result = simulateTimeline({
      startDay: start,
      precip,
      et0,
      soil: s,
      segments: [{ crop: wheat, sowingDay: toDayNumber("2021-11-30") }],
    });
    for (let i = 0; i < result.days; i++) {
      expect(result.ks[i]).toBeGreaterThanOrEqual(0);
      expect(result.ks[i]).toBeLessThanOrEqual(1);
      expect(result.dr[i]).toBeGreaterThanOrEqual(0);
    }
    expect(initialWaterState(s, 1).dr).toBeCloseTo(70);
  });
});
