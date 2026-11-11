import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type EngineInput, type EngineOutput, validate } from "../../src/contracts";
import {
  CRITERIA,
  REPLAY_LABEL,
  type ReplayRun,
  scoreReplay,
  simulateReplay,
} from "../../src/replay";
import { loadBundle } from "../physics/helpers";
import { makeBundle, makeInput, PRIORITIES, ROTATIONS, type Rotations } from "./helpers";

const json = (output: EngineOutput) => `${JSON.stringify(output, null, 2)}\n`;

describe("golden replays", () => {
  for (const name of ["semi-arid-winter-cereal", "fallow-heavy"] as const) {
    it(`matches the snapshot and is byte-identical across runs: ${name}`, async () => {
      const bundle = loadBundle(name);
      const first = scoreReplay(simulateReplay({ bundle, input: makeInput() }), PRIORITIES);
      const second = scoreReplay(simulateReplay({ bundle, input: makeInput() }), PRIORITIES);
      expect(json(first)).toBe(json(second));
      await expect(json(first)).toMatchFileSnapshot(`./golden/${name}.json`);
    });
  }

  it("is valid against the engine-output schema", () => {
    const out = scoreReplay(
      simulateReplay({ bundle: loadBundle("fallow-heavy"), input: makeInput() }),
      PRIORITIES,
    );
    const result = validate("engine-output", out);
    expect(result.ok).toBe(true);
  });

  it("changes bands with the seed but not the nominal scores", () => {
    const bundle = loadBundle("semi-arid-winter-cereal");
    const a = scoreReplay(simulateReplay({ bundle, input: makeInput({ seed: 1 }) }), PRIORITIES);
    const b = scoreReplay(simulateReplay({ bundle, input: makeInput({ seed: 2 }) }), PRIORITIES);
    expect(a.results.map((r) => r.score)).toEqual(b.results.map((r) => r.score));
    expect(a.results.map((r) => r.band)).not.toEqual(b.results.map((r) => r.band));
    expect(a.seed).toBe(1);
  });
});

describe("replay invariants", () => {
  const bundle = makeBundle(25);
  const run: ReplayRun = simulateReplay({ bundle, input: makeInput({ monte_carlo_draws: 24 }) });
  const priorities = fc.record({
    water: fc.integer({ min: 0, max: 5 }),
    soil_health: fc.integer({ min: 0, max: 5 }),
    nitrogen: fc.integer({ min: 0, max: 5 }),
    erosion: fc.integer({ min: 0, max: 5 }),
    forage: fc.integer({ min: 0, max: 5 }),
    income: fc.integer({ min: 0, max: 5 }),
    pest_break: fc.integer({ min: 0, max: 5 }),
  });
  const sum = (values: object) =>
    Object.values(values as Record<string, number>).reduce((a, b) => a + b, 0);

  it("replays every usable season of every rotation plus the baseline", () => {
    expect(run.rotations).toHaveLength(ROTATIONS.length);
    for (const r of run.rotations) expect(r.labels.length).toBeGreaterThanOrEqual(24);
    expect(REPLAY_LABEL).toBe("model-based counterfactual, not measured yield");
  });

  it("keeps scores in [0, 1] and contributions summing to the composite, for any priorities", () => {
    fc.assert(
      fc.property(priorities, (p) => {
        const out = scoreReplay(run, p);
        expect(validate("engine-output", out).ok).toBe(true);
        for (const result of out.results) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
          expect(sum(result.contributions)).toBeCloseTo(result.score, 9);
          for (const s of result.seasons) {
            expect(s.composite).toBeGreaterThanOrEqual(0);
            expect(s.composite).toBeLessThanOrEqual(1);
            expect(sum(s.contributions)).toBeCloseTo(s.composite, 9);
            for (const name of CRITERIA) {
              expect(s.criteria[name]).toBeGreaterThanOrEqual(0);
              expect(s.criteria[name]).toBeLessThanOrEqual(1);
            }
            if (s.band) {
              expect(s.band.p10).toBeLessThanOrEqual(s.band.median);
              expect(s.band.median).toBeLessThanOrEqual(s.band.p90);
            }
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it("ranks by median then P10, and reports a resilience profile consistent with the seasons", () => {
    fc.assert(
      fc.property(priorities, (p) => {
        const { results } = scoreReplay(run, p);
        results.slice(1).forEach((r, i) => {
          const before = results[i] as (typeof results)[number];
          expect(before.resilience.median).toBeGreaterThanOrEqual(r.resilience.median);
          if (before.resilience.median === r.resilience.median) {
            expect(before.resilience.p10).toBeGreaterThanOrEqual(r.resilience.p10);
          }
        });
        for (const r of results) {
          const composites = r.seasons.map((s) => s.composite);
          expect(r.resilience.median).toBe(r.score);
          expect(composites).toContain(r.score);
          expect(r.resilience.worst).toBe(Math.min(...composites));
          expect(r.resilience.p10).toBeLessThanOrEqual(r.resilience.median);
          expect(r.resilience.median).toBeLessThanOrEqual(r.resilience.p90);
          expect(r.resilience.severe_water_stress_seasons).toBeLessThanOrEqual(r.seasons.length);
          if (r.band) expect(r.band.p10).toBeLessThanOrEqual(r.band.p90);
        }
      }),
      { numRuns: 25 },
    );
  });

  it("re-ranks with new weights without changing the simulated criteria", () => {
    const heavyWater = scoreReplay(run, { ...PRIORITIES, water: 5, nitrogen: 0, erosion: 0 });
    const heavyNitrogen = scoreReplay(run, { ...PRIORITIES, water: 0, nitrogen: 5, erosion: 0 });
    const criteria = (o: EngineOutput) =>
      Object.fromEntries(o.results.map((r) => [r.rotation_id, r.seasons.map((s) => s.criteria)]));
    expect(criteria(heavyWater)).toEqual(criteria(heavyNitrogen));
    expect(heavyWater.results.map((r) => r.rotation_id)).not.toEqual(
      heavyNitrogen.results.map((r) => r.rotation_id),
    );
  });

  it("gives the same result when re-scored with the same priorities (idempotent)", () => {
    fc.assert(
      fc.property(priorities, (p) => {
        expect(json(scoreReplay(run, p))).toBe(json(scoreReplay(run, p)));
      }),
      { numRuns: 10 },
    );
  });

  it("measures win rate against the baseline, which has none itself", () => {
    const { results } = scoreReplay(run, PRIORITIES);
    const baseline = results.find((r) => r.rotation_id === "wheat_continuous");
    expect(baseline?.resilience.win_rate).toBeNull();
    for (const r of results) {
      if (r === baseline) continue;
      expect(r.resilience.win_rate).toBeGreaterThanOrEqual(0);
      expect(r.resilience.win_rate).toBeLessThanOrEqual(1);
    }
  });
});

describe("replay inputs", () => {
  const bundle = loadBundle("semi-arid-winter-cereal");
  const rotations: Rotations = [{ id: "wheat", seasons: [{ crop: "durum_wheat" }] }];

  it("adds a baseline that is not among the rotations to the results", () => {
    const input = makeInput({
      rotations,
      baseline: { id: "barley_now", seasons: [{ crop: "barley" }] },
      monte_carlo_draws: 0,
    });
    const out = scoreReplay(simulateReplay({ bundle, input }), PRIORITIES);
    expect(out.results.map((r) => r.rotation_id).sort()).toEqual(["barley_now", "wheat"]);
    expect(out.results.find((r) => r.rotation_id === "barley_now")?.resilience.win_rate).toBeNull();
    expect(out.results.find((r) => r.rotation_id === "wheat")?.resilience.win_rate).not.toBeNull();
  });

  it("has no win rate without a baseline and no bands without Monte Carlo draws", () => {
    const { baseline: _unused, ...rest } = makeInput({ rotations, monte_carlo_draws: 0 });
    const out = scoreReplay(simulateReplay({ bundle, input: rest }), PRIORITIES);
    const [only] = out.results;
    expect(only?.resilience.win_rate).toBeNull();
    expect(only?.band).toBeUndefined();
    expect(only?.seasons.every((s) => s.band === undefined)).toBe(true);
  });

  it("defaults to 200 draws and accepts the cover alias and a sowing override", () => {
    const input = makeInput({
      rotations: [
        {
          id: "wheat_cover",
          seasons: [{ crop: "durum_wheat", sowing_doy: 330 }, { crop: "cover" }],
        },
      ],
      baseline: undefined as never,
    });
    delete (input as { monte_carlo_draws?: number }).monte_carlo_draws;
    delete (input as { baseline?: unknown }).baseline;
    const run = simulateReplay({ bundle, input });
    expect(run.drawCount).toBe(200);
    expect(run.rotations[0]?.crops).toEqual(["durum_wheat", "cover_crop", "durum_wheat"]);
  });

  it("rejects what it cannot replay", () => {
    const bad = (overrides: Partial<EngineInput>) => () =>
      simulateReplay({ bundle, input: makeInput({ monte_carlo_draws: 2, ...overrides }) });
    expect(bad({ rotations: [{ id: "x", seasons: [{ crop: "nonexistent" }] }] })).toThrow(
      /Unknown crop/,
    );
    expect(bad({ rotations: [...rotations, ...rotations] })).toThrow(/unique/);
    expect(
      bad({
        rotations: [
          {
            id: "tight",
            seasons: [
              { crop: "durum_wheat", sowing_doy: 240 },
              { crop: "barley", sowing_doy: 300 },
            ],
          },
        ],
      }),
    ).toThrow(/overlap/);
  });

  it("needs at least one usable season", () => {
    const short = makeBundle(1);
    for (const s of short.series) {
      if (s.cadence === "daily") {
        s.values = s.values.slice(0, 200);
        s.quality = s.quality.slice(0, 200);
      }
    }
    expect(() =>
      simulateReplay({ bundle: short, input: makeInput({ monte_carlo_draws: 2 }) }),
    ).toThrow(/enough weather observations/);
  });

  it("drops a season whose crop would run past the weather record", () => {
    // Sown on 31 March, a 190-day crop ends in October: the record stops on 31 August 2024.
    const input = makeInput({
      rotations: [{ id: "late", seasons: [{ crop: "durum_wheat", sowing_doy: 90 }] }],
      monte_carlo_draws: 2,
    });
    const run = simulateReplay({ bundle, input });
    expect(run.rotations[0]?.labels).toEqual(["2021-22", "2022-23"]);
  });
});
