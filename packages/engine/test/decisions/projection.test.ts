import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CanonicalSeries } from "../../src/contracts";
import { validate } from "../../src/contracts";
import {
  applyScenario,
  parseProjection,
  projectionScenario,
  projectionShifts,
} from "../../src/decisions";
import { scoreReplay, simulateReplay } from "../../src/replay";
import { makeBundle, makeInput, PRIORITIES } from "../replay/helpers";

const fixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../fixtures/projection/setif-2050.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;
const payload = parseProjection(fixture);
const daily = (b: ReturnType<typeof makeBundle>, v: CanonicalSeries["var"]) =>
  b.series.find((s) => s.var === v && s.cadence === "daily") as CanonicalSeries;
const mean = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0) / xs.length;

describe("parseProjection", () => {
  it("reads the science API payload: three SSPs with model spread and provenance", () => {
    expect(Object.keys(payload.scenarios)).toEqual(["ssp126", "ssp245", "ssp370"]);
    const tmax = payload.scenarios.ssp245?.tmax;
    expect(tmax?.kind).toBe("additive");
    expect(tmax?.models).toBe(6);
    expect(tmax?.median).toHaveLength(12);
    expect((tmax?.min[6] as number) < (tmax?.median[6] as number)).toBe(true);
    expect((tmax?.max[6] as number) > (tmax?.median[6] as number)).toBe(true);
    expect(payload.scenarios.ssp126?.precip?.kind).toBe("multiplicative");
    expect(payload.provenance).toMatchObject({
      source: "NASA POWER Projection API (NEX-GDDP-CMIP6)",
      source_version: "v2.6.4-beta",
      path: "power",
      baseline_period: "1995-2014",
      future_period: "2041-2060",
    });
    expect(payload.provenance.models).toHaveLength(6);
  });

  it("rejects payloads that are not what the service returns", () => {
    const withScenarios = (scenarios: unknown) => ({ ...fixture, scenarios });
    const good = (fixture.scenarios as Record<string, Record<string, object>>).ssp126 as Record<
      string,
      object
    >;
    expect(() => parseProjection(null)).toThrow(/must be an object/);
    expect(() => parseProjection([])).toThrow(RangeError);
    expect(() => parseProjection({ ...fixture, scenarios: {} })).toThrow(
      /scenarios must be a non-empty object/,
    );
    expect(() => parseProjection({ scenarios: fixture.scenarios })).toThrow(
      /provenance must be an object/,
    );
    expect(() => parseProjection(withScenarios({ ssp126: 3 }))).toThrow(
      /scenarios\.ssp126 must be an object/,
    );
    expect(() => parseProjection(withScenarios({ ssp126: { ...good, snow: good.tmax } }))).toThrow(
      /scenarios\.ssp126\.snow/,
    );
    expect(() => parseProjection(withScenarios({ ssp126: { ...good, tmax: 1 } }))).toThrow(
      /tmax must be an object/,
    );
    expect(() =>
      parseProjection(
        withScenarios({ ssp126: { ...good, tmax: { ...good.tmax, kind: "ratio" } } }),
      ),
    ).toThrow(/kind/);
    expect(() =>
      parseProjection(
        withScenarios({ ssp126: { ...good, tmax: { ...good.tmax, median: [1, 2] } } }),
      ),
    ).toThrow(/twelve finite numbers/);
    expect(() =>
      parseProjection(
        withScenarios({
          ssp126: { ...good, tmax: { ...good.tmax, max: new Array(12).fill(Number.NaN) } },
        }),
      ),
    ).toThrow(/twelve/);
    expect(() => parseProjection(withScenarios({ ssp126: { tmax: good.tmax } }))).toThrow(
      /at least tmax and precip/,
    );
    expect(() => parseProjection({ ...fixture, provenance: { source: "x" } })).toThrow(
      /provenance\.baseline_period/,
    );
  });

  it("tolerates a missing optional provenance detail", () => {
    const lean = parseProjection({
      ...fixture,
      provenance: { source: "s", baseline_period: "a", future_period: "b", path: "archive" },
    });
    expect(lean.provenance).toMatchObject({
      source_version: null,
      path: "archive",
      resolution_deg: 0.25,
      models: [],
    });
  });
});

describe("projectionScenario", () => {
  it("turns the median, low and high factors into a valid projection scenario", () => {
    for (const spread of ["median", "low", "high"] as const) {
      const scenario = projectionScenario(payload, "ssp370", spread);
      expect(scenario).toMatchObject({
        id: `projection_ssp370_${spread}`,
        kind: "projection",
        ssp: "ssp370",
      });
      const key = { median: "median", low: "min", high: "max" }[spread] as "median" | "min" | "max";
      expect(scenario.monthly_factors?.tmax?.values).toEqual(payload.scenarios.ssp370?.tmax?.[key]);
      expect(scenario.monthly_factors?.precip?.kind).toBe("multiplicative");
      expect(validate("engine-input", makeInput({ scenario })).ok).toBe(true);
    }
  });

  it("orders the spread: low is below the median and high above it", () => {
    const at = (spread: "median" | "low" | "high") =>
      projectionScenario(payload, "ssp245", spread).monthly_factors?.tmax?.values[6] as number;
    expect(at("low")).toBeLessThan(at("median"));
    expect(at("median")).toBeLessThan(at("high"));
  });

  it("rejects an SSP the payload does not have and omits an unknown SSP label", () => {
    expect(() => projectionScenario(payload, "ssp999", "median")).toThrow(/no scenario "ssp999"/);
    const custom = {
      ...payload,
      scenarios: {
        custom: payload.scenarios.ssp126 as NonNullable<(typeof payload.scenarios)["ssp126"]>,
      },
    };
    expect(projectionScenario(custom, "custom", "median").ssp).toBeUndefined();
  });

  it("warms and dries the observed weather by the payload's factors", () => {
    const bundle = makeBundle(6);
    const out = applyScenario(bundle, projectionScenario(payload, "ssp126", "median"));
    const warming = mean(daily(out, "tmax").values) - mean(daily(bundle, "tmax").values);
    expect(warming).toBeGreaterThan(0.9);
    expect(warming).toBeLessThan(1.6);
    const ratio = mean(daily(out, "precip").values) / mean(daily(bundle, "precip").values);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1);
    expect(daily(out, "rh").values.every((v) => (v as number) <= 100)).toBe(true);
  });

  it("is replayed like any scenario", () => {
    const scenario = projectionScenario(payload, "ssp245", "median");
    const out = scoreReplay(
      simulateReplay({
        bundle: makeBundle(6),
        input: makeInput({ scenario, monte_carlo_draws: 0 }),
      }),
      PRIORITIES,
    );
    expect(out.scenario_id).toBe("projection_ssp245_median");
  });
});

describe("projectionShifts", () => {
  const bundle = makeBundle(12);
  const input = makeInput({ monte_carlo_draws: 0 });
  const shifts = projectionShifts({ bundle, input, payload });

  it("returns the three SSPs with a score shift and its model range for every rotation", () => {
    expect(shifts.ssps.map((s) => s.ssp)).toEqual(["ssp126", "ssp245", "ssp370"]);
    expect(shifts.provenance.future_period).toBe("2041-2060");
    for (const ssp of shifts.ssps) {
      expect(ssp.rotations).toHaveLength(10);
      for (const r of ssp.rotations) {
        for (const metric of [r.score, r.p10, r.worst]) {
          expect(metric.min).toBeLessThanOrEqual(metric.median);
          expect(metric.median).toBeLessThanOrEqual(metric.max);
        }
        expect(Number.isInteger(r.severe_water_stress_seasons)).toBe(true);
      }
    }
    expect(shifts.ssps.flatMap((s) => s.rotations).some((r) => r.score.min < r.score.max)).toBe(
      true,
    );
  });

  it("reports the history figures it compares against, matching a plain replay", () => {
    const plain = scoreReplay(simulateReplay({ bundle, input }), input.priorities);
    for (const r of shifts.ssps[0]?.rotations ?? []) {
      const h = plain.results.find((x) => x.rotation_id === r.rotation_id);
      expect(r.history.score).toBe(h?.score);
      expect(r.history.worst).toBe(h?.resilience.worst);
    }
  });

  it("shifts scores down more under the warmer and drier SSP", () => {
    const average = (ssp: string) => {
      const rows = shifts.ssps.find((s) => s.ssp === ssp)?.rotations ?? [];
      return rows.reduce((a, r) => a + r.score.median, 0) / rows.length;
    };
    expect(average("ssp370")).toBeLessThan(average("ssp126"));
    expect(average("ssp370")).toBeLessThan(0);
  });

  it("does not need Monte Carlo and leaves its input alone", () => {
    const withDraws = makeInput({ monte_carlo_draws: 200 });
    const copy = structuredClone(withDraws);
    projectionShifts({ bundle: makeBundle(4), input: withDraws, payload });
    expect(withDraws).toEqual(copy);
  });
});
