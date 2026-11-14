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

/** Seconds between polls of a running boundary job. */
const POLL_MS = 3000;

/** How far the service has got: date windows of imagery read out of the total. */
export interface Progress {
  done: number;
  total: number;
}

const ERROR_KINDS = ["no-field", "timeout", "unavailable"] as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function call(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BoundaryError("unavailable", "network");
  }
  if (response.status === 422) throw new BoundaryError("no-field", "no field found");
  if (!response.ok) throw new BoundaryError("unavailable", `status ${response.status}`);
  return response.json();
}

function readJob(body: unknown): {
  id: string;
  status: string;
  progress: Progress;
  body: Record<string, unknown>;
} {
  if (!isRecord(body) || typeof body.id !== "string" || typeof body.status !== "string") {
    throw new BoundaryError("unavailable", "unexpected response");
  }
  const progress = isRecord(body.progress) ? body.progress : {};
  return {
    id: body.id,
    status: body.status,
    progress: {
      done: typeof progress.done === "number" ? progress.done : 0,
      total: typeof progress.total === "number" ? progress.total : 0,
    },
    body,
  };
}

/**
 * Asks the science API for the field around a click: starts a job, then polls it until it is done,
 * reporting progress. A first click on a new place can take minutes. Throws `BoundaryError`.
 */
export async function proposeBoundary(
  [lon, lat]: [number, number],
  signal: AbortSignal,
  onProgress: (progress: Progress) => void = () => {},
): Promise<BoundaryProposal> {
  const base = `${config.scienceApiUrl}/v1/boundaries`;
  let job = readJob(
    await call(
      base,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lon, lat }),
      },
      signal,
    ),
  );
  while (job.status === "running") {
    onProgress(job.progress);
    await sleep(POLL_MS, signal);
    job = readJob(await call(`${base}/${job.id}`, {}, signal));
  }
  if (job.status === "done") return parse(job.body.proposal);
  const error = isRecord(job.body.error) ? job.body.error : {};
  const kind = ERROR_KINDS.find((k) => k === error.kind) ?? "unavailable";
  throw new BoundaryError(kind, typeof error.message === "string" ? error.message : kind);
}
