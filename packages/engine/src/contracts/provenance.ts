// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

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
