import { loadPack } from "@itza/knowledge";
import { describe, expect, it } from "vitest";
import { gaezCrops, inGaezCell } from "./gaez";

const story = loadPack("dz-high-plains");
const sample = gaezCrops(story, ["chickpea"])[0];
if (!sample) throw new Error("missing story evidence");

describe("GAEZ card context", () => {
  it("only includes the rotation's crops, once each, including explicit gaps", () => {
    const rows = gaezCrops(story, ["chickpea", "lentil", "chickpea", "fallow"]);
    expect(rows.map((r) => r.crop.id)).toEqual(["chickpea", "lentil", "fallow"]);
    expect(rows.map((r) => r.evidence.status)).toEqual([
      "available",
      "not_available",
      "not_available",
    ]);
    expect(gaezCrops(story, ["unknown"])).toEqual([]);
    expect(gaezCrops(story, [])).toEqual([]);
    expect(gaezCrops(loadPack("us-central-great-plains"), ["winter_wheat"])).toEqual([]);
    expect(gaezCrops(loadPack("generic"), ["fallow"])).toEqual([]);
  });

  it("recognizes the story centroid and other points inside the same native cell", () => {
    expect(inGaezCell([5.7295, 36.11965], sample.evidence)).toBe(true);
    // Native row 6465 / column 22287, captured from the source raster.
    expect(inGaezCell([5.7251, 36.1168], sample.evidence)).toBe(true);
    expect(inGaezCell([5.7332, 36.1249], sample.evidence)).toBe(true);
  });

  it.each([
    [5.7249, 36.12],
    [5.7334, 36.12],
    [5.73, 36.1166],
    [5.73, 36.1251],
    [5.41, 36.19],
    [-103.17, 40.16],
    [181, 36.12],
    [5.73, 91],
    [NaN, 36.12],
  ] as const)("does not apply a point rating outside the sampled cell: %s, %s", (lon, lat) => {
    expect(inGaezCell([lon, lat], sample.evidence)).toBe(false);
  });

  it("does not show a rating before a field is selected", () => {
    expect(inGaezCell(undefined, sample.evidence)).toBe(false);
  });

  it("does not mutate knowledge evidence while preparing the display", () => {
    const before = JSON.stringify(story);
    const rows = gaezCrops(story, ["chickpea", "barley"]);
    for (const { evidence } of rows) inGaezCell([5.7295, 36.11965], evidence);
    expect(JSON.stringify(story)).toBe(before);
  });
});
