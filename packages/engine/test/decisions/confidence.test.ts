import { loadPack } from "@itza/knowledge";
import { describe, expect, it } from "vitest";
import type { CanonicalSeries, FieldBundle, Soil } from "../../src/contracts";
import {
  confidenceFor,
  groundTruthScore,
  modelSatelliteAgreement,
  observedSoilSources,
  scaleOf,
  traitConfidence,
} from "../../src/decisions";
import {
  createReplayWorld,
  mulberry32,
  nominalTimeline,
  planOf,
  planRotation,
} from "../../src/replay";
import { loadBundle } from "../physics/helpers";
import { makeBundle, makeInput, SOIL } from "../replay/helpers";

const dz = loadPack("dz-high-plains");
const crops = (...ids: string[]) =>
  ids.map((id) => dz.crops.find((c) => c.id === id) as (typeof dz.crops)[number]);
const history = { id: "history", kind: "history" as const };
const baselineRotation = { id: "wheat", seasons: [{ crop: "durum_wheat" }] } as never;

function withSatellite(bundle: FieldBundle, valueAt: (i: number) => number | null): FieldBundle {
  const template = bundle.series.find((s) => s.var === "precip") as CanonicalSeries;
  const sm: CanonicalSeries = {
    ...template,
    var: "sm_rootzone",
    unit: "m3/m3",
    values: template.values.map((_, i) => valueAt(i)),
    quality: template.values.map(() => 0),
  };
  return { ...bundle, series: [...bundle.series.filter((s) => s.var !== "sm_rootzone"), sm] };
}

describe("ground truth", () => {
  const soil = (source: string): Soil => ({
    awc_mm_per_m: { value: 140, source, confidence: "high" },
  });

  it("recognizes soil values entered by the farmer", () => {
    expect(observedSoilSources(soil("user_soil_test"))).toEqual(["awc_mm_per_m"]);
    expect(observedSoilSources(soil("Observed by user"))).toEqual(["awc_mm_per_m"]);
    expect(observedSoilSources(soil("soilgrids"))).toEqual([]);
  });

  it("scores a soil test half, dates a quarter, yields or irrigation a quarter", () => {
    expect(groundTruthScore(soil("soilgrids")).score).toBe(0);
    expect(groundTruthScore(soil("user_soil_test"))).toEqual({
      score: 0.5,
      items: ["a soil test"],
    });
    expect(groundTruthScore(soil("soilgrids"), { plantingDates: 3 }).score).toBe(0.25);
    expect(groundTruthScore(soil("soilgrids"), { yields: 2 }).score).toBe(0.25);
    expect(groundTruthScore(soil("soilgrids"), { irrigationEvents: 1 }).score).toBe(0.25);
    expect(
      groundTruthScore(soil("user_soil_test"), { plantingDates: 1, yields: 1, irrigationEvents: 1 })
        .score,
    ).toBe(1);
  });
});

describe("trait confidence", () => {
  it("is lower for a crop with many team estimates and reports the review status", () => {
    const wheat = traitConfidence(dz, crops("durum_wheat")) as NonNullable<
      ReturnType<typeof traitConfidence>
    >;
    expect(wheat.score).toBeGreaterThan(0.3);
    expect(wheat.score).toBeLessThan(1);
    expect(wheat.lowShare).toBeGreaterThan(0);
    expect(wheat.needsReview).toBe(true);
    expect(
      traitConfidence({ review: { status: "expert_reviewed", note: "" } }, crops("durum_wheat"))
        ?.needsReview,
    ).toBe(false);
  });

  it("counts a crop once however often it repeats and covers fallow", () => {
    expect(traitConfidence(dz, crops("durum_wheat", "durum_wheat"))).toEqual(
      traitConfidence(dz, crops("durum_wheat")),
    );
    expect(traitConfidence(dz, crops("fallow"))).not.toBeNull();
    expect(traitConfidence(dz, [])).toBeNull();
  });
});

describe("scale", () => {
  it("compares the coarsest weather cell with the field's width", () => {
    const scale = scaleOf(loadBundle("semi-arid-winter-cereal"));
    expect(scale.resolutionM).toBe(55_000);
    expect(scale.source).toBe("nasa_power_daily");
    expect(scale.ratio).toBeCloseTo(55_000 / Math.sqrt(12.4 * 10_000), 6);
  });

  it("is never below 1 for a field larger than the cell", () => {
    const big = structuredClone(loadBundle("semi-arid-winter-cereal"));
    big.field.area_ha = 1e9;
    expect(scaleOf(big).ratio).toBe(1);
  });
});

describe("model-satellite agreement", () => {
  const bundle = makeBundle(8);
  const world = createReplayWorld({ bundle, input: { soil: SOIL, scenario: history } });
  const plan = planOf(world.pack, baselineRotation);
  const dr = nominalTimeline(world.ctx, planRotation(world.ctx, plan)).dr;
  const agree = (b: FieldBundle) => modelSatelliteAgreement(world, plan, b);

  it("is 1 when the satellite follows the model exactly, -1 when it is the mirror image", () => {
    const same = agree(withSatellite(bundle, (i) => 0.4 - 0.001 * (dr[i] as number)));
    const mirror = agree(withSatellite(bundle, (i) => 0.1 + 0.001 * (dr[i] as number)));
    expect(same?.correlation).toBeCloseTo(1, 6);
    expect(mirror?.correlation).toBeCloseTo(-1, 6);
    expect(same?.months).toBeGreaterThanOrEqual(24);
  });

  it("is near zero for an unrelated series", () => {
    const next = mulberry32(5);
    const noise = agree(withSatellite(bundle, () => 0.2 + 0.2 * next()));
    expect(Math.abs(noise?.correlation ?? 1)).toBeLessThan(0.35);
  });

  it("is unknown without the satellite series, with too few months, or with a constant series", () => {
    expect(agree(bundle)).toBeNull();
    const short = makeBundle(1);
    const shortWorld = createReplayWorld({
      bundle: short,
      input: { soil: SOIL, scenario: history },
    });
    const shortPlan = planOf(shortWorld.pack, baselineRotation);
    expect(
      modelSatelliteAgreement(
        shortWorld,
        shortPlan,
        withSatellite(short, () => 0.3),
      ),
    ).toBeNull();
    expect(agree(withSatellite(bundle, () => 0.3))).toBeNull();
    expect(agree(withSatellite(bundle, () => null))).toBeNull();
  });
});

describe("confidenceFor", () => {
  const bundle = loadBundle("semi-arid-winter-cereal");
  const world = createReplayWorld({ bundle, input: { soil: SOIL, scenario: history } });
  const base = { bundle, world, crops: crops("durum_wheat", "lentil"), agreement: null } as const;
  const soilOf = (source: string) => ({
    soil: { awc_mm_per_m: { value: 140, source, confidence: "high" as const } },
  });

  it("explains every factor in plain English", () => {
    const result = confidenceFor({ ...base, input: soilOf("soilgrids") });
    expect(result.reasons).toHaveLength(5);
    for (const reason of result.reasons) {
      expect(reason.length).toBeGreaterThan(10);
      expect(reason.length).toBeLessThanOrEqual(400);
    }
    expect(result.reasons[1]).toMatch(/55 km/);
    expect(result.reasons[2]).toMatch(/not enough satellite soil moisture/);
    expect(result.reasons[4]).toMatch(/No soil test/);
    expect(result.factors.agreement).toBeNull();
    expect(result.factors.coverage).toBeGreaterThan(0.99);
    expect(result.factors.scaleRatio).toBeGreaterThan(100);
  });

  it("is low for a coarse, estimated, unchecked field and rises with what the farmer observed", () => {
    const none = confidenceFor({ ...base, input: soilOf("soilgrids") });
    const tested = confidenceFor({ ...base, input: soilOf("user_soil_test") });
    const everything = confidenceFor({
      ...base,
      input: soilOf("user_soil_test"),
      agreement: { correlation: 0.9, months: 30 },
      groundTruth: { plantingDates: 3, yields: 3 },
    });
    expect(none.level).toBe("low");
    expect(tested.score).toBeGreaterThan(none.score);
    expect(tested.reasons[4]).toMatch(/a soil test/);
    expect(everything.score).toBeGreaterThan(tested.score);
    expect(everything.level).not.toBe("low");
    expect(everything.reasons[2]).toMatch(
      /follows the satellite soil moisture \(correlation 0.90 over 30 months\)/,
    );
  });

  it("reads weak agreement as weak and counts a negative one as no support", () => {
    const weak = confidenceFor({
      ...base,
      input: soilOf("soilgrids"),
      agreement: { correlation: 0.2, months: 30 },
    });
    const negative = confidenceFor({
      ...base,
      input: soilOf("soilgrids"),
      agreement: { correlation: -0.5, months: 30 },
    });
    expect(weak.reasons[2]).toMatch(/only weakly/);
    expect(negative.score).toBeLessThan(weak.score);
  });

  it("drops with missing weather observations", () => {
    const gappy = structuredClone(bundle);
    for (const s of gappy.series) {
      if (s.var === "precip" && s.cadence === "daily") {
        for (let i = 0; i < 365; i += 3) s.quality[i] = 2;
      }
    }
    const gappyWorld = createReplayWorld({
      bundle: gappy,
      input: { soil: SOIL, scenario: history },
    });
    const result = confidenceFor({
      ...base,
      bundle: gappy,
      world: gappyWorld,
      input: soilOf("soilgrids"),
    });
    expect(result.factors.coverage).toBeLessThan(0.95);
    expect(result.reasons[0]).toMatch(/only \d+% of the days/);
  });

  it("falls back to medium trait confidence when there are no crops", () => {
    const result = confidenceFor({ ...base, crops: [], input: soilOf("soilgrids") });
    expect(result.factors.traits).toBe(0.7);
    expect(result.reasons[3]).toMatch(/could not be checked/);
  });

  it("maps scores to levels at 0.45 and 0.7", () => {
    const high = confidenceFor({
      ...base,
      bundle: { ...bundle, field: { ...bundle.field, area_ha: 1e8 } },
      input: soilOf("user_soil_test"),
      agreement: { correlation: 1, months: 36 },
      groundTruth: { plantingDates: 1, yields: 1 },
      crops: crops("fallow"),
    });
    expect(high.level).toBe("high");
    expect(high.score).toBeGreaterThanOrEqual(0.7);
    expect(makeInput().seed).toBe(42);
  });
});
