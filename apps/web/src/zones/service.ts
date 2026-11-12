import type { FieldBundle } from "@itza/engine/contracts";
import { config } from "../lib/config";
import type { ZoneCollection } from "./types";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Typed parsing of an untrusted `/v1/zones` body; null when it is not a zone collection. */
export function parseZones(body: unknown): ZoneCollection | null {
  if (!isObject(body) || body.type !== "FeatureCollection" || typeof body.enabled !== "boolean")
    return null;
  if (!Array.isArray(body.features)) return null;
  for (const f of body.features) {
    if (!isObject(f) || !isObject(f.geometry) || !isObject(f.properties)) return null;
    const p = f.properties;
    if (typeof p.zone !== "number" || typeof p.area_ha !== "number" || !Array.isArray(p.notes))
      return null;
  }
  return {
    type: "FeatureCollection",
    enabled: body.enabled,
    reason: typeof body.reason === "string" ? body.reason : null,
    features: body.features as ZoneCollection["features"],
    k: typeof body.k === "number" ? body.k : null,
    stability: typeof body.stability === "number" ? body.stability : null,
    years: Array.isArray(body.years) ? (body.years as number[]) : [],
    coverage: typeof body.coverage === "number" ? body.coverage : 0,
    provenance: Array.isArray(body.provenance)
      ? (body.provenance as ZoneCollection["provenance"])
      : [],
  };
}

/** Zones for a bundle's field: the file the bundle links, else the science API. Throws on failure. */
export async function fetchZones(
  bundle: FieldBundle,
  period: { start: string; end: string },
  signal?: AbortSignal,
): Promise<ZoneCollection> {
  const linked = bundle.layers.zones;
  const awc = bundle.soil.awc_mm_per_m;
  const response = linked
    ? await fetch(new URL(linked, `${location.origin}/`), signal ? { signal } : {})
    : await fetch(`${config.scienceApiUrl}/v1/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry: bundle.field.geometry,
          period,
          ...(awc
            ? { soil: { awc_mm_per_m: awc.value, curve_number: 75, source: awc.source } }
            : {}),
        }),
        signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]),
      });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const zones = parseZones(await response.json());
  if (!zones) throw new Error("unexpected response");
  return zones;
}
