import { describe, expect, it } from "vitest";
import { parseTerrain } from "../terrainData";
import {
  decodeHeights,
  parseRelief,
  type Relief,
  sampleHeight,
  toPixel,
  toScene,
} from "./reliefData";

const SOURCE = {
  source: "USGS",
  product: "3DEP",
  version: "CO_CentralEasternPlains_2020_D20",
  resolution_m: 1,
  period: { start: "2020-05-09", end: "2020-09-07" },
  method: "export",
  coarse: false,
};
const BLOCK = {
  heightmap: "assets/relief/h.png",
  imagery: "assets/relief/i.jpg",
  width: 576,
  height: 572,
  bounds: [-103.1729, 40.1654, -103.1662, 40.1705],
  size_m: [575.6, 571.2],
  min_elevation_m: 1390,
  max_elevation_m: 1408.7,
  elevation_source: SOURCE,
  imagery_source: { ...SOURCE, source: "USDA", product: "NAIP" },
};
const BASE = "https://x.test/bundles/akron-proof-1/terrain.json";
const R = parseRelief(BLOCK, BASE) as Relief;

describe("parseRelief", () => {
  it("parses a relief block and resolves hrefs against the index URL", () => {
    expect(R.heightmapUrl).toBe("https://x.test/bundles/akron-proof-1/assets/relief/h.png");
    expect(R.imageryUrl).toBe("https://x.test/bundles/akron-proof-1/assets/relief/i.jpg");
    expect([R.width, R.height]).toEqual([576, 572]);
    expect(R.elevationSource.version).toBe("CO_CentralEasternPlains_2020_D20");
    expect(R.elevationCoarse).toBe(false);
    expect(R.imagerySource?.product).toBe("NAIP");
  });

  it("keeps a relief without a picture and marks coarse elevation", () => {
    const relief = parseRelief(
      {
        ...BLOCK,
        imagery: null,
        imagery_source: null,
        elevation_source: { ...SOURCE, coarse: true },
      },
      BASE,
    );
    expect(relief?.imageryUrl).toBeNull();
    expect(relief?.imagerySource).toBeNull();
    expect(relief?.elevationCoarse).toBe(true);
  });

  it.each([
    ["no bounds", { ...BLOCK, bounds: null }],
    ["a side over 1024", { ...BLOCK, width: 1025 }],
    ["a one-cell side", { ...BLOCK, height: 1 }],
    ["no heightmap", { ...BLOCK, heightmap: null }],
    ["no elevation source", { ...BLOCK, elevation_source: null }],
    ["a reversed elevation range", { ...BLOCK, min_elevation_m: 10, max_elevation_m: 5 }],
    ["a zero extent", { ...BLOCK, size_m: [0, 571] }],
  ])("returns null for %s", (_, block) => {
    expect(parseRelief(block, BASE)).toBeNull();
  });

  it("is exposed by parseTerrain, which stays valid without it", () => {
    const index = { available: true, layers: {}, relief: BLOCK };
    expect(parseTerrain(index, BASE)?.relief?.width).toBe(576);
    expect(parseTerrain({ available: true, layers: {} }, BASE)?.relief).toBeNull();
  });
});

describe("decodeHeights", () => {
  const small = { ...R, width: 2, height: 2, minElevationM: 100, maxElevationM: 200 };

  it("decodes heights from the red and green channels", () => {
    const rgba = new Uint8ClampedArray([
      255, 255, 0, 255, 0, 0, 0, 255, 128, 0, 0, 255, 0, 1, 0, 255,
    ]);
    const heights = decodeHeights(rgba, small);
    expect(heights[0]).toBeCloseTo(200);
    expect(heights[1]).toBeCloseTo(100);
    expect(heights[2]).toBeCloseTo(100 + (32768 / 65535) * 100, 3);
    expect(heights[3]).toBeCloseTo(100 + 100 / 65535, 3);
  });

  it("decodes a flat relief", () => {
    const flat = { ...small, minElevationM: 12.5, maxElevationM: 12.5 };
    expect([...decodeHeights(new Uint8ClampedArray(16), flat)]).toEqual([12.5, 12.5, 12.5, 12.5]);
  });

  it("rejects an image of the wrong size", () => {
    expect(() => decodeHeights(new Uint8ClampedArray(12), small)).toThrow(RangeError);
  });
});

describe("placement", () => {
  const [w, s, e, n] = R.bounds;

  it("maps the bounds corners to the scene edges", () => {
    expect(toScene(R, w, n)).toEqual([-R.sizeM[0] / 2, -R.sizeM[1] / 2]);
    expect(toScene(R, e, s)).toEqual([R.sizeM[0] / 2, R.sizeM[1] / 2]);
  });

  it("maps the bounds corners to canvas pixels", () => {
    expect(toPixel(R, w, n, 200, 100)).toEqual([0, 0]);
    expect(toPixel(R, e, s, 200, 100)).toEqual([200, 100]);
  });

  it("samples between cells and clamps outside the grid", () => {
    const grid = { ...R, width: 2, height: 2 };
    const heights = new Float32Array([0, 10, 20, 30]);
    expect(sampleHeight(grid, heights, 0.5, 0.5)).toBeCloseTo(15);
    expect(sampleHeight(grid, heights, 1, 0)).toBeCloseTo(10);
    expect(sampleHeight(grid, heights, -3, 9)).toBeCloseTo(20);
  });
});
