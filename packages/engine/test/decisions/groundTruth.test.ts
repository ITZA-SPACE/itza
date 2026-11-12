import { describe, expect, it } from "vitest";
import { confidenceFor, groundTruthScore } from "../../src/decisions";
import { fromDayNumber } from "../../src/physics";
import {
  createReplayWorld,
  planOf,
  planRotation,
  scoreReplay,
  simulateReplay,
} from "../../src/replay";
import { loadBundle } from "../physics/helpers";
import { makeBundle, makeInput, PRIORITIES } from "../replay/helpers";

const bundle = makeBundle(8);
const rotation = { id: "wheat", seasons: [{ crop: "durum_wheat" }] } as never;
const soil = (awc: number, source: string) => ({
  awc_mm_per_m: { value: awc, source, confidence: "high" as const },
});
const waterBalance = (awc: number, source: string) => {
  const input = makeInput({
    rotations: [rotation],
    baseline: undefined as never,
    soil: soil(awc, source),
    monte_carlo_draws: 0,
  });
  delete (input as { baseline?: unknown }).baseline;
  const out = scoreReplay(simulateReplay({ bundle, input }), PRIORITIES);
  const seasons = out.results[0]?.seasons ?? [];
  return seasons.reduce((a, s) => a + s.criteria.water_balance, 0) / seasons.length;
};

describe("ground truth overrides", () => {
  it("uses an observed soil value as given: a soil test changes water holding and the replay", () => {
    const dry = waterBalance(60, "user_soil_test");
    const wet = waterBalance(200, "user_soil_test");
    expect(wet).toBeGreaterThan(dry);
    expect(waterBalance(60, "soilgrids")).toBeCloseTo(dry, 9);
  });

  it("uses an observed sowing day instead of the pack's default", () => {
    const world = createReplayWorld({
      bundle,
      input: { soil: soil(140, "user_soil_test"), scenario: { id: "history", kind: "history" } },
    });
    const planned = (doy?: number) =>
      planRotation(
        world.ctx,
        planOf(world.pack, {
          id: "w",
          seasons: [doy ? { crop: "durum_wheat", sowing_doy: doy } : { crop: "durum_wheat" }],
        } as never),
      ).seasons[0]?.sowingDay as number;
    expect(planned(300) - planned()).not.toBe(0);
    expect(fromDayNumber(planned(300)).doy).toBe(300);
    expect(fromDayNumber(planned(40)).doy).toBe(40);
  });

  it("raises confidence as the farmer adds observations", () => {
    const world = createReplayWorld({
      bundle: loadBundle("semi-arid-winter-cereal"),
      input: { soil: soil(140, "soilgrids"), scenario: { id: "history", kind: "history" } },
    });
    const crops = planOf(world.pack, rotation).seasons.map((s) => s.entry);
    const at = (source: string, truth = {}) =>
      confidenceFor({
        bundle: loadBundle("semi-arid-winter-cereal"),
        world,
        crops,
        agreement: null,
        input: { soil: soil(140, source) },
        groundTruth: truth,
      }).score;
    const none = at("soilgrids");
    const soilTest = at("user_soil_test");
    const dates = at("user_soil_test", { plantingDates: 3 });
    const all = at("user_soil_test", { plantingDates: 3, irrigationEvents: 2 });
    expect(soilTest).toBeGreaterThan(none);
    expect(dates).toBeGreaterThan(soilTest);
    expect(all).toBeGreaterThan(dates);
    expect(groundTruthScore(soil(140, "soilgrids")).score).toBe(0);
  });
});
