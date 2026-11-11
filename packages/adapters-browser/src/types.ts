import type { CanonicalSeries, Gap } from "@itza/engine/contracts";

export type { CanonicalSeries, Gap };
export type CanonicalVar = CanonicalSeries["var"];
export type Severity = Gap["severity"];

export interface Period {
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, inclusive. */
  end: string;
}

/** Browser adapters query one point (the field centroid); field-tier aggregation is server-side. */
export interface FetchRequest {
  lat: number;
  lon: number;
  period: Period;
  variables: CanonicalVar[];
}

export interface Capabilities {
  variables: CanonicalVar[];
  resolution_m: number;
  coverage: { start: string; end: string };
  auth: "none" | "earthdata";
}

/** Adapters never throw on partial data or HTTP failure; they return gaps with a reason. */
export interface FetchResult {
  series: CanonicalSeries[];
  gaps: Gap[];
}

export interface BrowserAdapter {
  readonly id: string;
  capabilities(): Capabilities;
  fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult>;
}
