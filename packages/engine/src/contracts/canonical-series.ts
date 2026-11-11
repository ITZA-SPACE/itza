// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

/**
 * A time series in the canonical variable vocabulary (TECHNICAL_ARCHITECTURE 5.3).
 */
export interface CanonicalSeries {
  var:
    | "tmax"
    | "tmin"
    | "tmean"
    | "rh"
    | "wind2m"
    | "srad"
    | "precip"
    | "et_actual"
    | "sm_surface"
    | "sm_rootzone"
    | "ndvi"
    | "elevation"
    | "slope";
  unit: string;
  cadence: "daily" | "weekly" | "16-day" | "monthly" | "static";
  start: string;
  /**
   * One value per step; null where the source has no data.
   */
  values: (number | null)[];
  /**
   * Per-step flag, same length as values: 0 good, 1 gap-filled, 2 suspect, 3 missing.
   */
  quality: number[];
  provenance: Provenance;
  /**
   * Where the primary source changes over time (for example final to late IMERG).
   */
  segments: {
    start: string;
    source: string;
  }[];
}
/**
 * Where a number came from (C-2): every series carries one.
 */
export interface Provenance {
  source: string;
  product: string;
  version: string;
  resolution_m: number;
  period: Period;
  quality: "high" | "medium" | "low";
  /**
   * Source ids this value was derived from; empty for raw observations.
   */
  derived_from: string[];
  method?: string;
  retrieved?: string;
}
export interface Period {
  start: string;
  end: string;
}
