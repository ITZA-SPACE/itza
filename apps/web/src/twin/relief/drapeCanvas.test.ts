import { describe, expect, it } from "vitest";
import { ELEVATION_RAMP, elevationPixels, placeRect, rampColor } from "./drapeCanvas";
import type { Relief } from "./reliefData";

const SOURCE = {
  source: "USGS",
  product: "3DEP",
  version: "x",
  resolutionM: 1,
  period: { start: "2020-05-09", end: "2020-09-07" },
  method: "",
};
const R: Relief = {
  heightmapUrl: "h.png",
  imageryUrl: null,
  width: 2,
  height: 2,
  bounds: [10, 20, 12, 21],
  sizeM: [200, 100],
  minElevationM: 100,
  maxElevationM: 110,
  elevationSource: SOURCE,
  elevationCoarse: false,
  imagerySource: null,
};
const hex = ([r, g, b]: number[]) =>
  `#${[r, g, b].map((v) => (v as number).toString(16).padStart(2, "0")).join("")}`;

describe("elevation colours", () => {
  it("runs from the first stop to the last and clamps outside", () => {
    expect(hex(rampColor(0))).toBe(ELEVATION_RAMP[0]);
    expect(hex(rampColor(1))).toBe(ELEVATION_RAMP[ELEVATION_RAMP.length - 1]);
    expect(rampColor(2)).toEqual(rampColor(1));
    expect(rampColor(-1)).toEqual(rampColor(0));
    expect(hex(rampColor(0.5))).toBe(ELEVATION_RAMP[2]);
  });

  it("paints the lowest cell with the first colour and the highest with the last", () => {
    const pixels = elevationPixels(new Float32Array([100, 110, 105, 100]), R);
    expect(hex([...pixels.slice(0, 3)])).toBe(ELEVATION_RAMP[0]);
    expect(hex([...pixels.slice(4, 7)])).toBe(ELEVATION_RAMP[4]);
    expect(hex([...pixels.slice(8, 11)])).toBe(ELEVATION_RAMP[2]);
    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([255, 255, 255, 255]);
  });

  it("paints a flat relief in one colour", () => {
    const pixels = elevationPixels(new Float32Array([7, 7, 7, 7]), {
      ...R,
      minElevationM: 7,
      maxElevationM: 7,
    });
    expect(hex([...pixels.slice(0, 3)])).toBe(ELEVATION_RAMP[0]);
    expect([...pixels.slice(12, 15)]).toEqual([...pixels.slice(0, 3)]);
  });
});

describe("placeRect", () => {
  it("places an image that covers the relief on the whole canvas", () => {
    expect(placeRect(R, R.bounds, 200, 100)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it("places a centred half-size image in the middle", () => {
    expect(placeRect(R, [10.5, 20.25, 11.5, 20.75], 200, 100)).toEqual({
      x: 50,
      y: 25,
      w: 100,
      h: 50,
    });
  });
});
