import type { FieldBundle } from "@itza/engine/contracts";
import { config } from "../lib/config";

/** Provenance of a context value, as the science API returns it. */
export interface Source {
  source: string;
  product: string;
  version: string;
  resolution_m: number;
  period: { start: string; end: string };
}

export type Status = "ok" | "empty" | "pending";

export interface Snapshot {
  date: string;
  variable: "soil_moisture" | "esi" | "lst";
  stats: { mean: number; minimum: number; maximum: number; unit: string; coverage: number };
  quality: {
    policy: string;
    flags: Record<string, number>;
    valid_pixels: number;
    total_pixels: number;
  };
  provenance: Source;
  href: string;
  provisional: boolean;
  smap: {
    date: string;
    value: number | null;
    unit: string;
    provenance: Source | null;
    coverage_note: string;
  } | null;
}

export interface SceneResult {
  status: Status;
  scenes: Snapshot[];
  coverage_note: string;
  gaps: string[];
}

export interface GraceResult {
  status: Status;
  series: { date: string; anomaly_cm: number | null }[];
  trend_cm_per_year: number | null;
  period: { start: string; end: string } | null;
  provenance: Source | null;
  coverage_note: string;
  message: string;
}

export interface GediResult {
  status: Status;
  features: { properties: { date: string; on_field: boolean } }[];
  height_mean_m: number | null;
  cover_mean_fraction: number | null;
  on_field_count: number;
  tree_structure_hint: string;
  coverage_note: string;
  provenance: Source[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStatus = (v: unknown): v is Status => v === "ok" || v === "empty" || v === "pending";

function isSource(v: unknown): v is Source {
  return (
    isObject(v) &&
    typeof v.source === "string" &&
    typeof v.resolution_m === "number" &&
    isObject(v.period) &&
    typeof v.period.start === "string" &&
    typeof v.period.end === "string"
  );
}

function isSnapshot(v: unknown): v is Snapshot {
  return (
    isObject(v) &&
    typeof v.date === "string" &&
    typeof v.href === "string" &&
    isObject(v.stats) &&
    typeof v.stats.mean === "number" &&
    isObject(v.quality) &&
    typeof v.quality.valid_pixels === "number" &&
    isSource(v.provenance) &&
    (v.smap === null || v.smap === undefined || isObject(v.smap))
  );
}

/** Typed parsing of an untrusted scene body (`/v1/nisar`, `/v1/context/ecostress`). */
export function parseScenes(body: unknown): SceneResult | null {
  if (!isObject(body) || !isStatus(body.status) || typeof body.coverage_note !== "string")
    return null;
  if (!Array.isArray(body.scenes) || !body.scenes.every(isSnapshot)) return null;
  return {
    status: body.status,
    scenes: body.scenes.map((s) => ({
      ...s,
      provisional: s.provisional === true,
      smap: s.smap ?? null,
    })),
    coverage_note: body.coverage_note,
    gaps: Array.isArray(body.gaps) ? body.gaps.filter((g) => typeof g === "string") : [],
  };
}

export function parseGrace(body: unknown): GraceResult | null {
  if (!isObject(body) || !isStatus(body.status) || typeof body.coverage_note !== "string")
    return null;
  if (!Array.isArray(body.series)) return null;
  return {
    status: body.status,
    series: body.series as GraceResult["series"],
    trend_cm_per_year: typeof body.trend_cm_per_year === "number" ? body.trend_cm_per_year : null,
    period: isObject(body.period) ? (body.period as GraceResult["period"]) : null,
    provenance: isSource(body.provenance) ? body.provenance : null,
    coverage_note: body.coverage_note,
    message: typeof body.message === "string" ? body.message : "",
  };
}

export function parseGedi(body: unknown): GediResult | null {
  if (!isObject(body) || !isStatus(body.status) || typeof body.coverage_note !== "string")
    return null;
  if (!Array.isArray(body.features) || !Array.isArray(body.provenance)) return null;
  return {
    status: body.status,
    features: body.features.filter(
      (f): f is GediResult["features"][number] =>
        isObject(f) && isObject(f.properties) && typeof f.properties.date === "string",
    ),
    height_mean_m: typeof body.height_mean_m === "number" ? body.height_mean_m : null,
    cover_mean_fraction:
      typeof body.cover_mean_fraction === "number" ? body.cover_mean_fraction : null,
    on_field_count: typeof body.on_field_count === "number" ? body.on_field_count : 0,
    tree_structure_hint:
      typeof body.tree_structure_hint === "string" ? body.tree_structure_hint : "",
    coverage_note: body.coverage_note,
    provenance: body.provenance.filter(isSource),
  };
}

/** `west,south,east,north` of the field, the bbox the context endpoints take. */
export function fieldBbox(bundle: FieldBundle): string {
  const geometry = bundle.field.geometry;
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  const points = rings.flat();
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
    .map((v) => v.toFixed(5))
    .join(",");
}

/** Absolute URL of a context image the API returned as a path. */
export function assetUrl(href: string): string {
  return new URL(href, `${config.scienceApiUrl}/`).toString();
}

/**
 * GETs a context endpoint. A 202 means the API is still working: the body says `pending`, and the
 * query polls again (see useContext). Throws on HTTP errors and on unexpected bodies.
 */
export async function getContext<T>(
  path: string,
  params: Record<string, string>,
  parse: (body: unknown) => T | null,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${config.scienceApiUrl}${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const parsed = parse(await response.json());
  if (parsed === null) throw new Error("unexpected response");
  return parsed;
}
