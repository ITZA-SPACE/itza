import { loadPack } from "@itza/knowledge";
import { describe, expect, it } from "vitest";
import {
  defaultSowingDay,
  isCrop,
  kcAt,
  rootDepthAt,
  seasonLength,
  soilParams,
  stageAt,
  stageLengths,
  textureClass,
  toIsoDate,
} from "../../src/physics";
import { loadBundle, packCrop } from "./helpers";

const wheat = packCrop("dz-high-plains", "bread_wheat"); // stages 20, 60, 70, 30; Kc 0.4, 1.15, 0.3

describe("stage calendar and Kc curve", () => {
  it("has four stages that add up to the season", () => {
    const lengths = stageLengths(wheat);
    expect(lengths).toEqual([20, 60, 70, 30]);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(seasonLength(wheat));
  });

  it("finds the stage of each day and null outside the season", () => {
    expect([0, 19, 20, 79, 80, 149, 150, 179].map((d) => stageAt(wheat, d))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
    expect(stageAt(wheat, -1)).toBeNull();
    expect(stageAt(wheat, 180)).toBeNull();
  });

  it("follows the FAO-56 curve: flat, rising, flat, falling", () => {
    expect(kcAt(wheat, 0)).toBeCloseTo(0.4);
    expect(kcAt(wheat, 19)).toBeCloseTo(0.4);
    expect(kcAt(wheat, 50)).toBeCloseTo(0.4 + (30 / 60) * 0.75); // halfway through development
    expect(kcAt(wheat, 80)).toBeCloseTo(1.15);
    expect(kcAt(wheat, 149)).toBeCloseTo(1.15);
    expect(kcAt(wheat, 165)).toBeCloseTo(1.15 + (15 / 30) * (0.3 - 1.15));
    expect(kcAt(wheat, 180)).toBeCloseTo(0.3);
  });

  it("grows the root linearly to the maximum by the end of development", () => {
    expect(rootDepthAt(wheat, 0)).toBeCloseTo(0.15);
    expect(rootDepthAt(wheat, 40)).toBeCloseTo(0.15 + 0.5 * (1.65 - 0.15));
    expect(rootDepthAt(wheat, 80)).toBeCloseTo(1.65);
    expect(rootDepthAt(wheat, 170)).toBeCloseTo(1.65);
    expect(rootDepthAt(wheat, -5)).toBeCloseTo(0.15);
  });

  it("picks the middle of the sowing window, also across a year end", () => {
    expect(toIsoDate(defaultSowingDay(wheat, 2021))).toBe("2021-11-30"); // 11-10 .. 12-20
    expect(toIsoDate(defaultSowingDay(packCrop("dz-high-plains", "lentil"), 2021))).toBe(
      "2021-12-15",
    ); // 11-20 .. 01-10
  });

  it("tells crops from fallow", () => {
    const entries = loadPack("dz-high-plains").crops;
    expect(entries.filter(isCrop)).toHaveLength(entries.length - 1);
  });
});

describe("soil", () => {
  it.each([
    [5, 90, "sand"],
    [10, 80, "loamy_sand"],
    [10, 65, "sandy_loam"],
    [20, 40, "loam"],
    [15, 20, "silt_loam"],
    [5, 10, "silt"],
    [28, 60, "sandy_clay_loam"],
    [33, 30, "clay_loam"],
    [33, 10, "silty_clay_loam"],
    [40, 55, "sandy_clay"],
    [45, 10, "silty_clay"],
    [55, 25, "clay"],
  ] as const)("clay %i sand %i is %s", (clay, sand, expected) => {
    expect(textureClass(clay, sand)).toBe(expected);
  });

  it("reads the synthetic bundle soil and keeps the sourced awc", () => {
    const params = soilParams(loadBundle("semi-arid-winter-cereal").soil);
    expect(params.texture).toBe("clay_loam");
    expect(params.hydrologicGroup).toBe("D");
    expect(params.awcMmPerM).toBe(140);
    expect(params.assumedTexture).toBe(false);
  });

  it("assumes a loam, with table values, when texture is missing", () => {
    expect(soilParams({})).toMatchObject({
      texture: "loam",
      assumedTexture: true,
      awcMmPerM: 155,
      hydrologicGroup: "B",
    });
  });
});
