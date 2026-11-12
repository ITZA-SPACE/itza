import { describe, expect, it } from "vitest";
import type { CriterionValues, RotationResult, SeasonResult } from "../../src/contracts";
import {
  hasEconomics,
  incomeCriterion,
  rotationMargin,
  seasonMargin,
  yieldFactor,
} from "../../src/economics";

const crit = (climate_fit: number, water_balance: number): CriterionValues => ({
  climate_fit,
  water_balance,
  soil_nitrogen: 0,
  organic_matter: 0,
  erosion_control: 0,
  bare_exposure: 0,
  pest_pressure: 0,
  forage_income: 0,
});
const season = (crop: string, cf: number, wb: number, label = "2020-21"): SeasonResult => ({
  season: label,
  crop,
  criteria: crit(cf, wb),
  composite: 0,
  contributions: crit(0, 0),
});
const wheat = { yieldTonnesPerHa: 4, pricePerTonne: 300, costPerHa: 600 };

describe("economics margin", () => {
  it("averages climate fit and water balance into a clamped yield factor", () => {
    expect(yieldFactor(season("w", 0.8, 0.4))).toBeCloseTo(0.6);
    expect(yieldFactor(season("w", 2, 2))).toBe(1);
    expect(yieldFactor(season("w", -1, -1))).toBe(0);
  });

  it("computes price x yield x factor - cost", () => {
    expect(seasonMargin(season("w", 1, 1), wheat).margin).toBe(600);
    expect(seasonMargin(season("w", 0.5, 0.5), wheat).margin).toBe(0);
    expect(seasonMargin(season("w", 0, 0), wheat).margin).toBe(-600);
  });

  it("gives no margin to crops without economics or with a partial entry", () => {
    expect(seasonMargin(season("fallow", 1, 1), undefined).margin).toBeNull();
    expect(seasonMargin(season("w", 1, 1), { costPerHa: 600 }).margin).toBeNull();
    expect(
      seasonMargin(season("w", 1, 1), { ...wheat, pricePerTonne: Number.NaN }).margin,
    ).toBeNull();
    expect(seasonMargin(season("w", 1, 1), { ...wheat, costPerHa: -1 }).margin).toBeNull();
  });

  it("means margins over priced seasons and counts the rest", () => {
    const result = {
      rotation_id: "r1",
      seasons: [season("w", 1, 1, "a"), season("w", 0.5, 0.5, "b"), season("fallow", 1, 1, "c")],
    } as unknown as RotationResult;
    const m = rotationMargin(result, { w: wheat });
    expect(m.meanMargin).toBe(300);
    expect(m.missingSeasons).toBe(1);
    const none = rotationMargin(result, {});
    expect(none.meanMargin).toBeNull();
    expect(none.missingSeasons).toBe(3);
  });

  it("detects set economics", () => {
    expect(hasEconomics({})).toBe(false);
    expect(hasEconomics({ w: { pricePerTonne: 300 } })).toBe(false);
    expect(hasEconomics({ w: wheat })).toBe(true);
  });

  it("scales rotations to 0..1 and keeps unpriced ones null", () => {
    const mk = (rotationId: string, meanMargin: number | null) => ({
      rotationId,
      seasons: [],
      meanMargin,
      missingSeasons: 0,
    });
    const out = incomeCriterion([mk("a", 100), mk("b", 300), mk("c", null)]);
    expect(out.get("a")).toBe(0);
    expect(out.get("b")).toBe(1);
    expect(out.get("c")).toBeNull();
    expect(incomeCriterion([mk("a", 5), mk("b", 5)]).get("a")).toBe(0.5);
  });
});
