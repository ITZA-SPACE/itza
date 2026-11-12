import type { Field } from "@itza/engine/contracts";
import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
import length from "@turf/length";

export type FieldGeometry = Field["geometry"];

const ROUND_DIGITS = 5;

/**
 * Python's `round(value, 5)`: rounds the exact binary value, ties to even. `toFixed` is exact
 * too but sends ties away from zero, so exact ties (such as 0.015625) are corrected by hand.
 */
function roundNumber(value: number): number {
  const magnitude = Math.abs(value);
  const fraction = magnitude.toFixed(100).split(".")[1] ?? "";
  const tie = fraction[ROUND_DIGITS] === "5" && /^0*$/.test(fraction.slice(ROUND_DIGITS + 1));
  const lastKept = Number(fraction[ROUND_DIGITS - 1] ?? "0");
  const rounded =
    tie && lastKept % 2 === 0
      ? Number(`${Math.trunc(magnitude)}.${fraction.slice(0, ROUND_DIGITS)}`)
      : Number(magnitude.toFixed(ROUND_DIGITS));
  return value < 0 || Object.is(value, -0) ? -rounded : rounded;
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

// Python's float repr: "5.0" for whole numbers, "-0.0", and exponent form below 1e-4 ("5e-05").
// Coordinates are within ±180, so the exponent form for 1e16 and above never occurs.
function pythonFloat(value: number): string {
  if (Object.is(value, -0)) return "-0.0";
  if (Number.isInteger(value)) return `${value}.0`;
  if (Math.abs(value) < 1e-4) {
    const [mantissa, exponent = "0"] = value.toExponential().split("e");
    const sign = exponent.startsWith("-") ? "-" : "+";
    return `${mantissa}e${sign}${exponent.replace(/^[+-]/, "").padStart(2, "0")}`;
  }
  return String(value);
}

// Python's json.dumps with sort_keys and compact separators, so ids agree with the science API.
function pythonJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(",")}]`;
  if (typeof value === "number") return pythonFloat(value);
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
