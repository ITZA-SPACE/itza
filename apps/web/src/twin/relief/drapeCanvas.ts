import type { Bounds } from "../bounds";
import { type Relief, toPixel } from "./reliefData";

export type BaseMode = "imagery" | "elevation";

/** Low ground to high ground. */
export const ELEVATION_RAMP = ["#2b5fc4", "#3fb6c9", "#f2e35a", "#f08a2e", "#c92a2a"] as const;

const STOPS = ELEVATION_RAMP.map((hex) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]) as [number, number, number][];

/** Colour of the ramp at `t`, 0 for the lowest ground and 1 for the highest; clamped. */
export function rampColor(t: number): [r: number, g: number, b: number] {
  const position = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const index = Math.min(STOPS.length - 2, Math.floor(position));
  const mix = position - index;
  const from = STOPS[index] as [number, number, number];
  const to = STOPS[index + 1] as [number, number, number];
  return [
    Math.round(from[0] + (to[0] - from[0]) * mix),
    Math.round(from[1] + (to[1] - from[1]) * mix),
    Math.round(from[2] + (to[2] - from[2]) * mix),
  ];
}

/** RGBA pixels of the relief coloured by height, one per grid cell. */
export function elevationPixels(heights: Float32Array, relief: Relief): Uint8ClampedArray {
  const span = relief.maxElevationM - relief.minElevationM;
  const pixels = new Uint8ClampedArray(heights.length * 4);
  for (let i = 0; i < heights.length; i++) {
    const [r, g, b] = rampColor(
      span > 0 ? ((heights[i] as number) - relief.minElevationM) / span : 0,
    );
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/** Where an image with longitude/latitude bounds lands on a canvas laid over the relief. */
export function placeRect(
  relief: Relief,
  [west, south, east, north]: Bounds,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const [x, y] = toPixel(relief, west, north, width, height);
  const [right, bottom] = toPixel(relief, east, south, width, height);
  return { x, y, w: right - x, h: bottom - y };
}

export interface DrapeImage {
  image: CanvasImageSource;
  bounds: Bounds;
  opacity: number;
  /** Coarse data keeps its square pixels instead of being smoothed into false detail. */
  crisp?: boolean;
}

export interface DrapeShape {
  rings: [number, number][][];
  color: string;
  /** Fill opacity; 0 draws the line only. */
  fill: number;
  width: number;
  closed: boolean;
}

export interface DrapeLayers {
  /** Covers the whole relief: the aerial picture or the elevation colours. */
  base: CanvasImageSource | null;
  /** Shown when there is no base yet. */
  ground: string;
  images: DrapeImage[];
  shapes: DrapeShape[];
}

/** Paints everything that lies on the surface into the one canvas the terrain wears. */
export function paintDrape(
  context: CanvasRenderingContext2D,
  relief: Relief,
  layers: DrapeLayers,
): void {
  const { width, height } = context.canvas;
  context.globalAlpha = 1;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = layers.ground;
  context.fillRect(0, 0, width, height);
  if (layers.base) context.drawImage(layers.base, 0, 0, width, height);
  for (const layer of layers.images) {
    const { x, y, w, h } = placeRect(relief, layer.bounds, width, height);
    context.globalAlpha = layer.opacity;
    context.imageSmoothingEnabled = !layer.crisp;
    context.drawImage(layer.image, x, y, w, h);
  }
  context.imageSmoothingEnabled = true;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const shape of layers.shapes) {
    context.beginPath();
    for (const ring of shape.rings) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = toPixel(relief, lon, lat, width, height);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      if (shape.closed) context.closePath();
    }
    if (shape.fill > 0) {
      context.globalAlpha = shape.fill;
      context.fillStyle = shape.color;
      context.fill("evenodd");
    }
    context.globalAlpha = 1;
    context.strokeStyle = shape.color;
    context.lineWidth = shape.width;
    context.stroke();
  }
  context.globalAlpha = 1;
}
