import type { FieldGeometry } from "../../data/geometry";
import { config } from "../../lib/config";
import type { Bounds } from "../bounds";
import { type DataSource, parseBounds, parseSource } from "../frames";

/** The detailed surface of one field: a height image and an aerial picture on the same grid. */
export interface Relief {
  heightmapUrl: string;
  imageryUrl: string | null;
  width: number;
  height: number;
  /** The grid is linear in longitude and latitude; row 0 is the north edge. */
  bounds: Bounds;
  sizeM: [eastWest: number, northSouth: number];
  minElevationM: number;
  maxElevationM: number;
  elevationSource: DataSource;
  /** True when the elevation is too coarse to show relief inside the field. */
  elevationCoarse: boolean;
  imagerySource: DataSource | null;
}

const MAX_SIDE = 1024;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSide = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 1 && (v as number) <= MAX_SIDE;

/** Typed parsing of the `relief` block of a terrain index; hrefs resolve against `base`. */
export function parseRelief(value: unknown, base: string): Relief | null {
  if (!isObject(value)) return null;
  const bounds = parseBounds(value.bounds);
  const size = value.size_m;
  const elevationSource = parseSource(value.elevation_source);
  if (
    typeof value.heightmap !== "string" ||
    !isSide(value.width) ||
    !isSide(value.height) ||
    !bounds ||
    !Array.isArray(size) ||
    !isNumber(size[0]) ||
    !isNumber(size[1]) ||
    size[0] <= 0 ||
    size[1] <= 0 ||
    !isNumber(value.min_elevation_m) ||
    !isNumber(value.max_elevation_m) ||
    value.max_elevation_m < value.min_elevation_m ||
    !elevationSource
  ) {
    return null;
  }
  const imagerySource = parseSource(value.imagery_source);
  const hasImagery = typeof value.imagery === "string" && imagerySource !== null;
  return {
    heightmapUrl: new URL(value.heightmap, base).href,
    imageryUrl: hasImagery ? new URL(value.imagery as string, base).href : null,
    width: value.width,
    height: value.height,
    bounds,
    sizeM: [size[0], size[1]],
    minElevationM: value.min_elevation_m,
    maxElevationM: value.max_elevation_m,
    elevationSource,
    elevationCoarse: isObject(value.elevation_source) && value.elevation_source.coarse === true,
    imagerySource: hasImagery ? imagerySource : null,
  };
}

/** How long the science API may take to build a relief package it has not built before. */
const BUILD_TIMEOUT_MS = 150_000;

/**
 * The relief of a field straight from its outline. The science API builds it on the first request
 * (up to a minute) and answers from its cache afterwards. Null when no elevation covers the field.
 */
export async function fetchRelief(
  geometry: FieldGeometry,
  signal?: AbortSignal,
): Promise<Relief | null> {
  const response = await fetch(`${config.scienceApiUrl}/v1/relief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geometry }),
    signal: AbortSignal.any([AbortSignal.timeout(BUILD_TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body: unknown = await response.json();
  return parseRelief(isObject(body) ? body.relief : null, `${config.scienceApiUrl}/`);
}

/**
 * Heights in metres from the pixels of the height image (red is the high byte, green the low one),
 * row 0 north. Throws when the pixel count does not match the grid.
 */
export function decodeHeights(rgba: Uint8ClampedArray, relief: Relief): Float32Array {
  const count = relief.width * relief.height;
  if (rgba.length !== count * 4) throw new RangeError("height image does not match the grid");
  const span = relief.maxElevationM - relief.minElevationM;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const value = ((rgba[i * 4] as number) * 256 + (rgba[i * 4 + 1] as number)) / 65535;
    heights[i] = relief.minElevationM + value * span;
  }
  return heights;
}

export async function loadHeights(relief: Relief, signal?: AbortSignal): Promise<Float32Array> {
  const response = await fetch(relief.heightmapUrl, signal ? { signal } : {});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // No colour management: the two bytes of a height must arrive exactly as stored.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    if (bitmap.width !== relief.width || bitmap.height !== relief.height) {
      throw new RangeError("height image does not match the grid");
    }
    const canvas = document.createElement("canvas");
    canvas.width = relief.width;
    canvas.height = relief.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2D canvas");
    context.drawImage(bitmap, 0, 0);
    return decodeHeights(context.getImageData(0, 0, relief.width, relief.height).data, relief);
  } finally {
    bitmap.close();
  }
}

/** Position on the relief as fractions: `u` from the west edge, `v` from the north edge. */
export function toUV(relief: Relief, lon: number, lat: number): [u: number, v: number] {
  const [w, s, e, n] = relief.bounds;
  return [(lon - w) / (e - w), (n - lat) / (n - s)];
}

/** Metres from the relief centre: +x east, +z south. */
export function toScene(relief: Relief, lon: number, lat: number): [x: number, z: number] {
  const [u, v] = toUV(relief, lon, lat);
  return [(u - 0.5) * relief.sizeM[0], (v - 0.5) * relief.sizeM[1]];
}

/** Pixel in a canvas of the given size laid over the relief bounds. */
export function toPixel(
  relief: Relief,
  lon: number,
  lat: number,
  width: number,
  height: number,
): [x: number, y: number] {
  const [u, v] = toUV(relief, lon, lat);
  return [u * width, v * height];
}

/** Height in metres at a fractional position, bilinear between the four nearest cells. */
export function sampleHeight(relief: Relief, heights: Float32Array, u: number, v: number): number {
  const x = Math.min(1, Math.max(0, u)) * (relief.width - 1);
  const y = Math.min(1, Math.max(0, v)) * (relief.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(relief.width - 1, x0 + 1);
  const y1 = Math.min(relief.height - 1, y0 + 1);
  const a = x - x0;
  const b = y - y0;
  const at = (col: number, row: number) => heights[row * relief.width + col] as number;
  return (
    (at(x0, y0) * (1 - a) + at(x1, y0) * a) * (1 - b) + (at(x0, y1) * (1 - a) + at(x1, y1) * a) * b
  );
}
