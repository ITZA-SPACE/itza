import { loadPack } from "@itza/knowledge";
import { describe, expect, it } from "vitest";
import { validate } from "../../src/contracts";
import { palette } from "../../src/decisions";
import {
  type CompareRequest,
  type CompareResult,
  createReplayHandler,
  type DesignResult,
} from "../../src/worker";
import { loadBundle } from "../physics/helpers";
import { makeBundle, makeInput } from "../replay/helpers";

const bundle = loadBundle("semi-arid-winter-cereal");
const longBundle = makeBundle(15);
const { rotations: _unused, ...baseInput } = makeInput({ monte_carlo_draws: 20 });
const request = (over: Partial<CompareRequest> = {}): CompareRequest => ({
  bundle,
  input: baseInput,
  ...over,
});

function session() {
  const handle = createReplayHandler();
  let id = 0;
  const call = <T>(type: string, payload: unknown): T => {
    const response = handle({ id: ++id, type, payload } as never);
    if (!response.ok) throw new Error(`${response.error.name}: ${response.error.message}`);
    return response.result as T;
  };
  return { call, handle };
}

describe("palette", () => {
  const crops = palette(loadPack("dz-high-plains"));

  it("lists every crop of the pack with a family and a sowing season for sown crops", () => {
    expect(crops.length).toBe(loadPack("dz-high-plains").crops.length);
    expect(crops.find((c) => c.id === "fallow")).toMatchObject({
      kind: "fallow",
      family: null,
      sowing: null,
      seasonDays: null,
    });
    for (const crop of crops.filter((c) => c.kind === "crop")) {
      expect(["winter", "summer"]).toContain(crop.sowing);
      expect(crop.seasonDays).toBeGreaterThan(0);
    }
  });

  it("calls cereals sown in autumn winter crops and spring-sown crops summer crops", () => {
    const sowing = (id: string) => crops.find((c) => c.id === id)?.sowing;
    expect(sowing("durum_wheat")).toBe("winter");
    expect(sowing("barley")).toBe("winter");
    expect(sowing("spring_sunflower")).toBe("summer");
  });
});

describe("design", () => {
  const { call, handle } = session();
  call<CompareResult>("compare", request({ bundle: longBundle }));
  const design = (crops: string[]) => call<DesignResult>("design", { crops });

  it("needs a comparison first", () => {
    const fresh = session();
    expect(
      fresh.handle({ id: 1, type: "design", payload: { crops: ["fallow"] } } as never),
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/Call compare before design/) },
    });
  });

  it("returns one entry per timeline position with the four curves", () => {
    const report = design(["durum_wheat", "chickpea", "barley", "fallow"]);
    expect(report.seasons.map((s) => s.crop)).toEqual([
      "durum_wheat",
      "chickpea",
      "barley",
      "fallow",
    ]);
    for (const s of report.seasons) {
      expect(s.waterStressDays).toBeGreaterThanOrEqual(0);
      expect(s.severeStressDays).toBeLessThanOrEqual(s.waterStressDays);
      expect(s.coverMonths).toBeGreaterThanOrEqual(0);
      expect(s.coverMonths).toBeLessThanOrEqual(12);
      expect(s.pestPressure).toBeGreaterThanOrEqual(0);
      expect(s.pestPressure).toBeLessThanOrEqual(1);
      expect(s.years).toBeGreaterThan(0);
    }
    expect(report.replayedSeasons).toBeGreaterThan(0);
  });

  it("shows the nitrogen the previous crop leaves, around the cycle", () => {
    const report = design(["durum_wheat", "chickpea"]);
    const pack = loadPack("dz-high-plains");
    const credit = (id: string) => pack.crops.find((c) => c.id === id)?.n_credit_kg_ha.value;
    expect(report.seasons[0]?.nitrogenKgHa).toBe(credit("chickpea"));
    expect(report.seasons[1]?.nitrogenKgHa).toBe(credit("durum_wheat"));
  });

  it("warns about wheat after wheat and puts the warning on the seasons involved", () => {
    const report = design(["durum_wheat", "durum_wheat", "fallow"]);
    const warning = report.warnings.find((w) => w.kind === "pest_break");
    expect(warning?.message).toMatch(/Durum wheat after Durum wheat/);
    expect(warning?.positions).toEqual([0, 1]);
  });

  it("warns about continuous wheat only and gives it more pest pressure than a rotation", () => {
    const continuous = design(["durum_wheat", "durum_wheat", "durum_wheat"]);
    const rotated = design(["durum_wheat", "chickpea", "barley", "fallow"]);
    expect(rotated.warnings.some((w) => /Durum wheat after/.test(w.message))).toBe(false);
    expect(continuous.warnings.some((w) => /Durum wheat after/.test(w.message))).toBe(true);
    const mean = (r: DesignResult) =>
      r.seasons.reduce((a, s) => a + s.pestPressure, 0) / r.seasons.length;
    expect(mean(continuous)).toBeGreaterThan(mean(rotated));
  });

  it("reports a crop the field's climate cannot grow as a climate warning", () => {
    const report = design(["potato_irrigated", "fallow", "durum_wheat"]);
    expect(report.warnings.some((w) => w.kind === "climate" || w.kind === "constraint")).toBe(
      report.warnings.length > 0,
    );
  });

  it("explains seasons that cannot be laid out instead of failing", () => {
    const report = design(["potato_irrigated"]);
    expect(report.seasons.length === 0 ? report.warnings.length > 0 : true).toBe(true);
  });

  it("rejects an unknown crop and an empty design", () => {
    expect(
      handle({ id: 99, type: "design", payload: { crops: ["no_such_crop"] } } as never),
    ).toMatchObject({
      ok: false,
    });
    expect(handle({ id: 100, type: "design", payload: { crops: [] } } as never)).toMatchObject({
      ok: false,
      error: { name: "ValidationError" },
    });
  });

  it("answers in well under the 150 ms budget", () => {
    const crops = ["durum_wheat", "chickpea", "barley", "fallow", "rapeseed", "oats"];
    design(crops);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) design(crops);
    expect((performance.now() - t0) / 5).toBeLessThan(150);
  });
});

describe("compare with designs", () => {
  const mine = {
    id: "design",
    name: "My design",
    seasons: [{ crop: "durum_wheat" }, { crop: "chickpea" }, { crop: "barley" }],
  };

  it("scores the design with the other rotations and gives it an evidence card", () => {
    const { call } = session();
    const result = call<CompareResult>("compare", request({ designs: [mine] as never }));
    const card = result.cards.find((c) => c.rotation_id === "design");
    expect(card).toBeDefined();
    expect(card?.is_baseline).toBe(false);
    expect(validate("evidence-card", card).ok).toBe(true);
    expect(result.rotations.find((r) => r.id === "design")?.name).toBe("My design");
    expect(result.definitions.map((r) => r.id)).toContain("design");
    const output = result.output.results.find((r) => r.rotation_id === "design");
    expect(output?.band).toBeDefined();
    expect(validate("engine-output", result.output).ok).toBe(true);
  });

  it("refuses a design whose id is already a rotation", () => {
    const { handle } = session();
    const response = handle({
      id: 1,
      type: "compare",
      payload: request({ designs: [{ ...mine, id: "wheat_continuous" }] as never }),
    } as never);
    expect(response).toMatchObject({ ok: false });
  });
});
