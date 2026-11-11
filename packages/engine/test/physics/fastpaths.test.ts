import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BARE_PROFILE_M,
  type CropSegment,
  cropCurves,
  type HydrologicGroup,
  kcAt,
  rootDepthAt,
  type SoilParams,
  seasonLength,
  simulateTimeline,
  stageAt,
  stepWaterBalance,
  toDayNumber,
} from "../../src/physics";
import { packCrop } from "./helpers";

const soil = (awcMmPerM: number, group: HydrologicGroup = "B"): SoilParams => ({
  texture: "loam",
  assumedTexture: false,
  awcMmPerM,
  hydrologicGroup: group,
  rewMm: 9,
  tewMm: 20,
});

describe("crop curves", () => {
  const crops = ["durum_wheat", "barley", "lentil", "cover_crop"].map((id) =>
    packCrop("dz-high-plains", id),
  );

  it("equal the per-day lookups on every day of the season", () => {
    for (const crop of crops) {
      const curves = cropCurves(crop);
      expect(curves.kc).toHaveLength(seasonLength(crop));
      for (let d = 0; d < seasonLength(crop); d++) {
        expect(curves.kc[d]).toBe(kcAt(crop, d));
        expect(curves.zr[d]).toBe(rootDepthAt(crop, d));
        expect(curves.stage[d]).toBe(stageAt(crop, d));
      }
    }
  });

  it("are computed once per crop object and not shared with a changed copy", () => {
    const [wheat] = crops as [(typeof crops)[number]];
    expect(cropCurves(wheat)).toBe(cropCurves(wheat));
    const wetter = { ...wheat, kc_mid: { ...wheat.kc_mid, value: wheat.kc_mid.value * 1.1 } };
    expect(cropCurves(wetter).kc).not.toEqual(cropCurves(wheat).kc);
  });
});

describe("dry bare day on a dry topsoil", () => {
  const dryTop = (dr: number) => ({ dr, zr: BARE_PROFILE_M, de: 20 });

  it("moves nothing: no runoff, percolation or evaporation, depletion unchanged", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 60, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        (awc, dr, et0) => {
          const s = soil(awc);
          const { state, flux } = stepWaterBalance(
            dryTop(Math.min(dr, awc)),
            s,
            { precip: 0, et0 },
            { type: "bare" },
          );
          expect(state.dr).toBeCloseTo(Math.min(dr, awc), 12);
          expect(state.de).toBe(20);
          expect(flux.runoff).toBe(0);
          expect(flux.deepPercolation).toBe(0);
          expect(flux.eta).toBe(0);
          expect(flux.etc).toBeCloseTo(1.2 * et0, 12);
          expect(flux.ks).toBe(et0 > 0 ? 0 : 1);
        },
      ),
    );
  });

  it("agrees with the general path as the topsoil gets arbitrarily close to dry (continuity)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 60, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.double({ min: 0.5, max: 9, noNaN: true }),
        (awc, dr, et0) => {
          const s = soil(awc);
          const exact = stepWaterBalance(
            dryTop(Math.min(dr, awc)),
            s,
            { precip: 0, et0 },
            { type: "bare" },
          );
          const nearly = stepWaterBalance(
            { dr: Math.min(dr, awc), zr: BARE_PROFILE_M, de: 20 - 1e-9 },
            s,
            { precip: 0, et0 },
            { type: "bare" },
          );
          expect(nearly.state.dr).toBeCloseTo(exact.state.dr, 6);
          expect(nearly.flux.eta).toBeCloseTo(exact.flux.eta, 6);
          expect(nearly.flux.runoff).toBeCloseTo(exact.flux.runoff, 6);
          expect(nearly.flux.deepPercolation).toBeCloseTo(exact.flux.deepPercolation, 6);
        },
      ),
    );
  });
});

describe("timeline without daily arrays", () => {
  const wheat = packCrop("dz-high-plains", "durum_wheat");
  const barley = packCrop("dz-high-plains", "barley");
  const startDay = toDayNumber("2000-09-01");
  const days = 365 * 4;

  it("gives the same summaries, final state and runoff as the full timeline", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.double({ min: 80, max: 180, noNaN: true }),
        (seed, awc) => {
          const precip = Float64Array.from({ length: days }, (_, i) =>
            (i * 7 + seed) % 11 === 0 ? ((i + seed) % 17) + 1 : 0,
          );
          const et0 = Float64Array.from(
            { length: days },
            (_, i) => 1 + 4 * Math.sin((Math.PI * (i % 365)) / 365) ** 2,
          );
          const segments: CropSegment[] = [
            { crop: wheat, sowingDay: startDay + 90 },
            { crop: barley, sowingDay: startDay + 365 + 100 },
            { crop: wheat, sowingDay: startDay + 2 * 365 + 90 },
          ];
          const base = { startDay, precip, et0, soil: soil(awc), segments };
          const full = simulateTimeline(base);
          const lean = simulateTimeline({ ...base, daily: false });
          expect(lean.segments).toEqual(full.segments);
          expect(lean.finalState).toEqual(full.finalState);
          expect(lean.runoff).toEqual(full.runoff);
          expect(lean.dr).toHaveLength(0);
          expect(lean.stage).toHaveLength(0);
          expect(full.dr).toHaveLength(days);
        },
      ),
      { numRuns: 20 },
    );
  });
});
