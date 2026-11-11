import type { Field } from "@itza/engine/contracts";
import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
import length from "@turf/length";

export type FieldGeometry = Field["geometry"];

const ROUND_FACTOR = 1e5;

function roundNumber(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

function roundCoordinates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(roundCoordinates) as T;
  if (typeof value === "number") return roundNumber(value) as T;
  return value;
}

function feature(geometry: FieldGeometry) {
  return { type: "Feature", properties: {}, geometry } as const;
}

/** Coordinates rounded to 1e-5 degrees (about 1 m), the precision of the field id and cache keys. */
export function roundGeometry(geometry: FieldGeometry): FieldGeometry {
  return {
    type: geometry.type,
    coordinates: roundCoordinates(geometry.coordinates),
  } as FieldGeometry;
}

export function areaHa(geometry: FieldGeometry): number {
  return area(feature(geometry)) / 10_000;
}

/** Longitude, latitude of the polygon's center of mass. */
export function centroid(geometry: FieldGeometry): [number, number] {
  const [lon, lat] = centerOfMass(feature(geometry)).geometry.coordinates;
  return [roundNumber(lon ?? 0), roundNumber(lat ?? 0)];
}

/** Total ring length in meters (outer rings and holes). */
export function perimeterM(geometry: FieldGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    for (const ring of rings) {
      total += length(
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } },
        { units: "meters" },
      );
    }
  }
  return total;
}

// Python's json.dumps writes whole floats as "5.0"; match it so ids agree with the science API.
function pythonJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(",")}]`;
  if (typeof value === "number") return Number.isInteger(value) ? `${value}.0` : String(value);
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${pythonJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `sha256:` plus the hash of the geometry rounded to 1e-5 degrees; equals the science API field id. */
export async function fieldId(geometry: FieldGeometry): Promise<string> {
  return `sha256:${await sha256Hex(pythonJson(roundGeometry(geometry)))}`;
}
