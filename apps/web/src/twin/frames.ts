import type { FieldBundle } from "@itza/engine/contracts";
import { config } from "../lib/config";

type Bounds = [west: number, south: number, east: number, north: number];

/** Where a frame or terrain product comes from, as the science API reports it. */
export interface DataSource {
  source: string;
  product: string;
  version: string;
  resolutionM: number;
  period: { start: string; end: string };
  method: string;
}

export interface TwinFrame {
  /** ISO date of the acquisition. */
  date: string;
  variable: "ndvi" | "moisture";
  /** Absolute URL of the PNG. */
  url: string;
  bounds: Bounds;
  source: DataSource;
  width: number;
  height: number;
}

export interface FrameGap {
  var: string;
  reason: string;
}

export interface FrameSet {
  /** Frames of each variable, oldest first. */
  ndvi: TwinFrame[];
  moisture: TwinFrame[];
  gaps: FrameGap[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseBounds(value: unknown): Bounds | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isNumber)) return null;
  const [w, s, e, n] = value as Bounds;
  return w < e && s < n ? [w, s, e, n] : null;
}

export function parseSource(value: unknown): DataSource | null {
  if (!isObject(value)) return null;
  const period = value.period;
  if (
    typeof value.source !== "string" ||
    !isNumber(value.resolution_m) ||
    !isObject(period) ||
    !isIsoDate(period.start) ||
    !isIsoDate(period.end)
  ) {
    return null;
  }
  return {
    source: value.source,
    product: typeof value.product === "string" ? value.product : value.source,
    version: typeof value.version === "string" ? value.version : "",
    resolutionM: value.resolution_m,
    period: { start: period.start, end: period.end },
    method: typeof value.method === "string" ? value.method : "",
  };
}

export function parseGaps(value: unknown): FrameGap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((g) =>
    isObject(g) && typeof g.var === "string" && typeof g.reason === "string"
      ? [{ var: g.var, reason: g.reason }]
      : [],
  );
}

/**
 * Typed parsing of a frame index (`frames/1.0`). Frames that do not parse are dropped rather than
 * failing the whole index; `base` is the index's own URL, which relative hrefs resolve against.
 */
export function parseFrameIndex(body: unknown, base: string): FrameSet | null {
  if (!isObject(body) || !Array.isArray(body.frames)) return null;
  const frames: TwinFrame[] = [];
  for (const raw of body.frames) {
    if (!isObject(raw)) continue;
    const bounds = parseBounds(raw.bounds);
    const source = parseSource(raw.source);
    if (
      !bounds ||
      !source ||
      !isIsoDate(raw.date) ||
      (raw.variable !== "ndvi" && raw.variable !== "moisture") ||
      typeof raw.href !== "string"
    ) {
      continue;
    }
    frames.push({
      date: raw.date,
      variable: raw.variable,
      url: new URL(raw.href, base).href,
      bounds,
      source,
      width: isNumber(raw.width) ? raw.width : 0,
      height: isNumber(raw.height) ? raw.height : 0,
    });
  }
  frames.sort((a, b) => a.date.localeCompare(b.date));
  return {
    ndvi: frames.filter((f) => f.variable === "ndvi"),
    moisture: frames.filter((f) => f.variable === "moisture"),
    gaps: parseGaps(body.gaps),
  };
}

const API_BUNDLE = /^\/v1\/bundles\/([0-9a-f]{64})\//;

/** The science API's id for a bundle it built, read from the link its frame index carries. */
export function apiBundleId(bundle: FieldBundle): string | null {
  return API_BUNDLE.exec(bundle.layers?.ndvi_frames ?? "")?.[1] ?? null;
}

/**
 * Where the bundle's frame index is: the science API for a bundle it built, the hero field's static
 * folder for a precomputed one. Null when the bundle links no frames.
 */
export function frameIndexUrl(bundle: FieldBundle, heroId: string | undefined): string | null {
  const link = bundle.layers?.ndvi_frames;
  if (!link) return null;
  if (link.startsWith("/")) return `${config.scienceApiUrl}${link}`;
  if (!heroId) return null;
  return new URL(`${import.meta.env.BASE_URL}bundles/${heroId}/${link}`, location.href).href;
}

/** The index of the frame nearest to `date` (ISO), or -1 when there are none. */
export function nearestFrame(frames: readonly { date: string }[], date: string): number {
  if (frames.length === 0) return -1;
  const target = Date.parse(`${date}T00:00:00Z`);
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  frames.forEach((frame, i) => {
    const d = Math.abs(Date.parse(`${frame.date}T00:00:00Z`) - target);
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  return best;
}

export async function fetchFrames(url: string, signal?: AbortSignal): Promise<FrameSet> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const set = parseFrameIndex(await response.json(), url);
  if (!set) throw new Error("unexpected frame index");
  return set;
}
