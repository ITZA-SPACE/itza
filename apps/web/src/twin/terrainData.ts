import type { FieldBundle } from "@itza/engine/contracts";
import { config } from "../lib/config";
import {
  apiBundleId,
  type DataSource,
  type FrameGap,
  parseBounds,
  parseGaps,
  parseSource,
} from "./frames";
import { parseRelief, type Relief } from "./relief/reliefData";

type Bounds = [west: number, south: number, east: number, north: number];

export interface FlowLines {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { upstream_cells: number };
  }[];
}

export interface TerrainProducts {
  available: boolean;
  /** Where the colorized PNGs sit on the map. */
  displayBounds: Bounds | null;
  /** Absolute URLs of the colorized previews by product (`slope_class`, `concavity`, `accumulation`). */
  images: Partial<Record<"slope_class" | "concavity" | "accumulation", string>>;
  flowLines: FlowLines;
  source: DataSource | null;
  gaps: FrameGap[];
  /** The detailed 3D surface, when the index carries one. */
  relief: Relief | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const PRODUCTS = ["slope_class", "concavity", "accumulation"] as const;

function parseFlowLines(value: unknown): FlowLines {
  const empty: FlowLines = { type: "FeatureCollection", features: [] };
  if (!isObject(value) || !Array.isArray(value.features)) return empty;
  const features: FlowLines["features"] = [];
  for (const f of value.features) {
    if (!isObject(f) || !isObject(f.geometry) || !isObject(f.properties)) continue;
    const { coordinates } = f.geometry;
    const cells = f.properties.upstream_cells;
    if (
      f.geometry.type !== "LineString" ||
      !Array.isArray(coordinates) ||
      typeof cells !== "number"
    ) {
      continue;
    }
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coordinates as [number, number][] },
      properties: { upstream_cells: cells },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Typed parsing of a terrain index (`terrain/1.0`); `base` is its URL, which asset hrefs resolve against. */
export function parseTerrain(body: unknown, base: string): TerrainProducts | null {
  if (!isObject(body) || typeof body.available !== "boolean") return null;
  const layers = isObject(body.layers) ? body.layers : {};
  const images: TerrainProducts["images"] = {};
  for (const product of PRODUCTS) {
    const href = layers[`${product}_png`];
    if (typeof href === "string") images[product] = new URL(href, base).href;
  }
  return {
    available: body.available,
    displayBounds: parseBounds(body.display_bounds),
    images,
    flowLines: parseFlowLines(body.flow_lines),
    source: parseSource(body.provenance),
    gaps: parseGaps(body.gaps),
    relief: parseRelief(body.relief, base),
  };
}

/** The terrain index: the science API's for a bundle it built, a hero field's static file otherwise. */
export function terrainUrl(bundle: FieldBundle, heroId: string | undefined): string | null {
  const id = apiBundleId(bundle);
  if (id) return `${config.scienceApiUrl}/v1/bundles/${id}/terrain`;
  if (!heroId) return null;
  return new URL(`${import.meta.env.BASE_URL}bundles/${heroId}/terrain.json`, location.href).href;
}

export async function fetchTerrain(url: string, signal?: AbortSignal): Promise<TerrainProducts> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const terrain = parseTerrain(await response.json(), url);
  if (!terrain) throw new Error("unexpected terrain index");
  return terrain;
}
