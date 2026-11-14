import type { HttpClient } from "../http";
import type { SourceEntry } from "../manifest";
import type { CanonicalSeries, CanonicalVar, Capabilities, Period } from "../types";
import { qualityFromCoverage, todayIso } from "../util";

export interface AdapterDeps {
  http: HttpClient;
  /** Clock for the provenance `retrieved` date; injectable for tests. */
  now?: () => Date;
}

export function capabilitiesOf(entry: SourceEntry): Capabilities {
  return {
    variables: Object.keys(entry.variables) as CanonicalVar[],
    resolution_m: entry.resolution_m,
    coverage: entry.coverage,
    auth: entry.auth,
  };
}

/** Builds a series whose provenance comes from the manifest entry. */
export function buildSeries(
  entry: SourceEntry,
  deps: AdapterDeps,
  fields: {
    var: CanonicalVar;
    unit: string;
    cadence: CanonicalSeries["cadence"];
    start: string;
    values: (number | null)[];
    period: Period;
    method: string;
    version?: string;
    /** Caps the quality label, for example for a proxy variable. */
    maxQuality?: "high" | "medium" | "low";
  },
): CanonicalSeries {
  const observed = fields.values.filter((v) => v !== null).length;
  let quality = qualityFromCoverage(observed, fields.values.length);
  if (fields.maxQuality === "low" || (fields.maxQuality === "medium" && quality === "high")) {
    quality = fields.maxQuality;
  }
  return {
    var: fields.var,
    unit: fields.unit,
    cadence: fields.cadence,
    start: fields.start,
    values: fields.values,
    quality: fields.values.map((v) => (v === null ? 2 : 0)),
    provenance: {
      source: entry.id,
      product: entry.product,
      version: fields.version ?? entry.version,
      resolution_m: entry.resolution_m,
      period: fields.period,
      quality,
      method: fields.method,
      retrieved: todayIso((deps.now ?? (() => new Date()))()),
    },
  };
}
