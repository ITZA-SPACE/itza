import type { SourceEntry } from "../manifest";
import type { Capabilities, Gap, Period } from "../types";
import { asNumber, gap, isRecord } from "../util";
import { type AdapterDeps, capabilitiesOf } from "./common";

export interface CollectionInfo {
  id: string;
  shortName: string;
  version: string;
  title: string;
  timeStart: string | null;
  timeEnd: string | null;
}

export interface GranuleInfo {
  id: string;
  title: string;
  timeStart: string;
}

export interface GranuleAvailability {
  shortName: string;
  /** Total matching granules; null when CMR did not report a count. */
  hits: number | null;
  /** Most recent matching granule, if any. */
  latest: GranuleInfo | null;
}

export interface CmrResult<T> {
  /** Absent when CMR could not be reached or answered with an unexpected shape. */
  value?: T;
  gaps: Gap[];
}

function entries(data: unknown): Record<string, unknown>[] | undefined {
  if (!isRecord(data) || !isRecord(data.feed) || !Array.isArray(data.feed.entry)) return undefined;
  return data.feed.entry.filter(isRecord);
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * NASA CMR metadata search (CORS-enabled, no login). Answers "does this product have data here
 * and then?", which feeds provenance and gap detection. It does not return canonical series.
 */
export class CmrAdapter {
  readonly id: string;

  constructor(
    private readonly entry: SourceEntry,
    private readonly deps: AdapterDeps,
  ) {
    this.id = entry.id;
  }

  capabilities(): Capabilities {
    return capabilitiesOf(this.entry);
  }

  async collection(shortName: string, signal?: AbortSignal): Promise<CmrResult<CollectionInfo>> {
    const url = `${this.entry.endpoint}/collections.json?short_name=${encodeURIComponent(shortName)}&page_size=1`;
    const response = await this.deps.http.getJson(url, signal);
    if (!response.ok) {
      return { gaps: [gap(shortName, `CMR unavailable: ${response.reason}`)] };
    }
    const found = entries(response.data)?.[0];
    if (!found) {
      return { gaps: [gap(shortName, `CMR has no collection named ${shortName}`)] };
    }
    return {
      value: {
        id: text(found.id),
        shortName: text(found.short_name) || shortName,
        version: text(found.version_id),
        title: text(found.title),
        timeStart: text(found.time_start) || null,
        timeEnd: text(found.time_end) || null,
      },
      gaps: [],
    };
  }

  /** Granules of `shortName` covering a point in a period; an empty result is reported as a gap. */
  async granules(
    query: { shortName: string; lat: number; lon: number; period: Period; variable?: string },
    signal?: AbortSignal,
  ): Promise<CmrResult<GranuleAvailability>> {
    const label = query.variable ?? query.shortName;
    const temporal = `${query.period.start}T00:00:00Z,${query.period.end}T23:59:59Z`;
    const url =
      `${this.entry.endpoint}/granules.json?short_name=${encodeURIComponent(query.shortName)}` +
      `&point=${query.lon},${query.lat}&temporal=${temporal}&sort_key=-start_date&page_size=1`;
    const response = await this.deps.http.getJson(url, signal);
    if (!response.ok) {
      return { gaps: [gap(label, `CMR unavailable: ${response.reason}`)] };
    }
    const found = entries(response.data);
    if (!found) {
      return { gaps: [gap(label, "CMR returned an unexpected response")] };
    }
    const hitsHeader = asNumber(Number(response.headers.get("CMR-Hits")));
    const hits = response.headers.has("CMR-Hits") ? hitsHeader : found.length;
    const latest = found[0];
    if (hits === 0 || !latest) {
      return {
        value: { shortName: query.shortName, hits: 0, latest: null },
        gaps: [gap(label, `No ${query.shortName} granules cover this point in this period`)],
      };
    }
    return {
      value: {
        shortName: query.shortName,
        hits,
        latest: {
          id: text(latest.id),
          title: text(latest.title),
          timeStart: text(latest.time_start),
        },
      },
      gaps: [],
    };
  }
}
