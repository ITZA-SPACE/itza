import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SeasonResult } from "@itza/engine/memory";
import { analyseFieldMemory } from "@itza/engine/memory";
import { describe, expect, it } from "vitest";
import { ndviSources } from "../memory/ndvi";
import { regionFor } from "../memory/region";
import { summarizeConfusion } from "./groundTruth";
import {
  type CdlLabel,
  cdlCropName,
  compareHistory,
  parseCdl,
  seasonIdForYear,
} from "./proofHistory";
import { PROOF_FIELDS } from "./useProofData";

const bundles = resolve(import.meta.dirname, "../../public/bundles");
const read = (id: string, file: string) =>
  JSON.parse(readFileSync(resolve(bundles, id, file), "utf8"));

function season(
  id: string,
  label: SeasonResult["label"],
  extra: Partial<SeasonResult> = {},
): SeasonResult {
  return {
    phenology: { season: id, inferred: { crop: "winter_wheat", confidence: "high" } },
    label,
    bareDays: 0,
    coverage: 1,
    insufficient: false,
    ...extra,
  } as SeasonResult;
}

const record = (year: number, label: string, histogram: Record<string, number>): CdlLabel => ({
  season: String(year),
  label,
  histogram,
  fraction: 1,
});

describe("season mapping", () => {
  it("maps a CDL year to the Field Memory season that ends in it", () => {
    expect(seasonIdForYear(2021)).toBe("2020-21");
    expect(seasonIdForYear(2000)).toBe("1999-00");
  });
});

describe("compareHistory", () => {
  const memory = [
    season("2019-20", "winter_crop"),
    season("2020-21", "fallow_or_bare"),
    season("2021-22", "uncertain"),
    season("2022-23", "winter_crop", { insufficient: true }),
    season("2023-24", "summer_crop"),
  ];
  const cdl = [
    record(2020, "crop", { "24": 10 }),
    record(2021, "crop", { "24": 10 }),
    record(2022, "fallow", { "61": 10 }),
    record(2023, "fallow", { "61": 10 }),
    record(2024, "other", { "176": 10 }),
    record(2025, "crop", { "24": 10 }),
  ];
  const result = compareHistory({ id: "f", name: "Field" }, memory, cdl);

  it("compares crop against crop and fallow against crop", () => {
    expect(result.seasons.map((s) => [s.season, s.inferredClass, s.groundTruthClass])).toEqual([
      ["2019-20", "crop", "crop"],
      ["2020-21", "fallow", "crop"],
    ]);
  });

  it("lists every season it leaves out, with a reason, and never drops one silently", () => {
    expect(result.skipped).toEqual([
      { season: "2021-22", reason: "fieldMemoryUncertain" },
      { season: "2022-23", reason: "fieldMemoryNoData" },
      { season: "2023-24", reason: "recordMixed" },
      { season: "2024-25", reason: "fieldMemoryNoData" },
    ]);
    expect(result.seasons.length + result.skipped.length).toBe(cdl.length);
  });

  it("counts agreement over the compared seasons only", () => {
    const summary = summarizeConfusion([result]);
    expect(summary).toMatchObject({
      totalSeasons: 2,
      cropCrop: 1,
      fallowCrop: 1,
      agreement: 0.5,
      skippedSeasons: 4,
    });
  });
});

describe("parseCdl and names", () => {
  it("ignores anything that is not the expected shape", () => {
    expect(parseCdl(null)).toEqual([]);
    expect(parseCdl({ labels: "no" })).toEqual([]);
    expect(parseCdl({ labels: [{ season: 1 }, { nothing: true }] })).toEqual([]);
  });

  it("names the modal class of the public record", () => {
    expect(cdlCropName(record(2020, "crop", { "24": 12, "1": 3 }))).toBe("Winter wheat");
    expect(cdlCropName(record(2020, "crop", { "999": 5 }))).toBe("Crop (class 999)");
    expect(cdlCropName(record(2020, "fallow", { "61": 8 }))).toBe("Fallow");
  });
});

describe("the three real proof fields", () => {
  const histories = PROOF_FIELDS.map((hero) => {
    const bundle = read(hero.id, "bundle.json");
    const [lon, lat] = bundle.field.centroid as [number, number];
    const region = regionFor(lon, lat);
    const memory = analyseFieldMemory({
      series: ndviSources(bundle),
      calendar: region.calendar,
      crops: region.crops,
    });
    return compareHistory(
      { id: hero.id, name: hero.id },
      memory.seasons,
      parseCdl(read(hero.id, "cdl.json")),
    );
  });

  it("has three proof fields with at least 15 compared seasons each", () => {
    expect(histories).toHaveLength(3);
    for (const field of histories) expect(field.seasons.length).toBeGreaterThanOrEqual(15);
  });

  it("measures an agreement that is a real fraction of the compared seasons", () => {
    const summary = summarizeConfusion(histories);
    expect(summary.totalSeasons).toBeGreaterThanOrEqual(45);
    const agreeing = summary.cropCrop + summary.fallowFallow;
    expect(summary.agreement).toBeCloseTo(agreeing / summary.totalSeasons, 10);
    // Recorded 2026-11-13: 35 of 45 seasons (78 %), below the PRD's 80 % target. If the method or
    // the data change, update this range and the notes in docs/FEATURES.md F-22.
    expect(summary.agreement).toBeGreaterThan(0.7);
    expect(summary.agreement).toBeLessThan(0.9);
  });
});
