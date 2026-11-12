import type { FieldBundle, Gap } from "@itza/engine/contracts";

export type { FieldBundle, Gap };

export type SourceStatus = "pending" | "loading" | "done" | "error" | "skipped";

/** Source ids are manifest ids for browser sources, plus `science_api` and `hero_bundle`. */
export type SourceStates = Record<string, SourceStatus>;

export interface BundleSnapshot {
  bundle: FieldBundle;
  sources: SourceStates;
  /** True once every source has finished (or failed) and the bundle was validated. */
  complete: boolean;
  fromCache: boolean;
}

export interface Period {
  start: string;
  end: string;
}

export interface LoadOptions {
  period?: Period;
  /** Id of a precomputed hero field in `public/bundles/<id>/bundle.json`. */
  heroId?: string;
  signal?: AbortSignal;
}
