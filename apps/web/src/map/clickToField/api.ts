import { config } from "../../lib/config";
import type { FieldPolygon } from "../../state";

export type BoundaryConfidence = "high" | "medium" | "low";

/** A proposed outline from the science API (`POST /v1/boundaries`); never saved by itself. */
export interface BoundaryProposal {
  geometry: FieldPolygon;
  areaHa: number;
  confidence: BoundaryConfidence;
  datesUsed: number;
  period: { start: string; end: string };
  /** Product and resolution of the imagery the outline was traced from. */
  source: { product: string; resolutionM: number };
}

/** Why no proposal came back: what the service said, or that it could not be reached. */
export class BoundaryError extends Error {
  constructor(
    readonly kind: "no-field" | "timeout" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function parse(body: unknown): BoundaryProposal {
  if (!isRecord(body) || !isRecord(body.geometry) || !isRecord(body.period)) {
    throw new BoundaryError("unavailable", "unexpected response");
  }
  const { geometry, period } = body;
  const source = Array.isArray(body.sources) ? body.sources[0] : undefined;
  const ring = Array.isArray(geometry.coordinates) ? geometry.coordinates[0] : undefined;
  if (
    geometry.type !== "Polygon" ||
    !Array.isArray(ring) ||
    ring.length < 4 ||
    typeof body.area_ha !== "number" ||
    (body.confidence !== "high" && body.confidence !== "medium" && body.confidence !== "low") ||
    typeof body.dates_used !== "number" ||
    typeof period.start !== "string" ||
    typeof period.end !== "string" ||
    !isRecord(source) ||
    typeof source.product !== "string" ||
    typeof source.resolution_m !== "number"
  ) {
    throw new BoundaryError("unavailable", "unexpected response");
  }
  return {
    geometry: geometry as unknown as FieldPolygon,
    areaHa: body.area_ha,
    confidence: body.confidence,
    datesUsed: body.dates_used,
    period: { start: period.start, end: period.end },
    source: { product: source.product, resolutionM: source.resolution_m },
  };
}

/** Asks the science API for the field around a click. Throws `BoundaryError`. */
export async function proposeBoundary(
  [lon, lat]: [number, number],
  signal: AbortSignal,
): Promise<BoundaryProposal> {
  let response: Response;
  try {
    response = await fetch(`${config.scienceApiUrl}/v1/boundaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lon, lat }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BoundaryError("unavailable", "network");
  }
  if (response.status === 422) throw new BoundaryError("no-field", "no field found");
  if (response.status === 504) throw new BoundaryError("timeout", "timeout");
  if (!response.ok) throw new BoundaryError("unavailable", `status ${response.status}`);
  return parse(await response.json());
}
