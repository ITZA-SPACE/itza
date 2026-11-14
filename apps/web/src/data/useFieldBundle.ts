import { experimental_streamedQuery as streamedQuery, useQuery } from "@tanstack/react-query";
import { loadFieldBundle } from "./defaults";
import { type FieldGeometry, roundGeometry } from "./geometry";
import { HERO_FIELDS } from "./hero";
import type { BundleSnapshot, LoadOptions, SourceStates } from "./types";

/** The precomputed hero field whose outline this is, if any (compared after rounding, as field ids are). */
export function heroIdFor(geometry: FieldGeometry | undefined): string | undefined {
  if (!geometry) return undefined;
  const key = JSON.stringify(roundGeometry(geometry));
  return HERO_FIELDS.find((h) => JSON.stringify(roundGeometry(h.geometry)) === key)?.id;
}

/**
 * Loads a field bundle progressively. `bundle` and `sources` update each time a source finishes;
 * `isComplete` is true once every source has finished (failed sources appear in `bundle.gaps`).
 */
export function useFieldBundle(
  geometry: FieldGeometry | undefined,
  givenOptions: Omit<LoadOptions, "signal"> = {},
) {
  // A hero field's outline loads its precomputed bundle, so every caller agrees on one load.
  const heroId = givenOptions.heroId ?? heroIdFor(geometry);
  const options = heroId ? { ...givenOptions, heroId } : givenOptions;
  const query = useQuery<BundleSnapshot | null>({
    queryKey: ["field-bundle", geometry, options.heroId ?? null, options.period ?? null],
    enabled: geometry !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    // Run offline too: the loader reads the IndexedDB cache and turns failed sources into gaps.
    networkMode: "offlineFirst",
    queryFn: streamedQuery<BundleSnapshot, BundleSnapshot | null>({
      streamFn: ({ signal }) => {
        if (!geometry) throw new Error("geometry is required");
        return loadFieldBundle(geometry, { ...options, signal });
      },
      reducer: (_previous, snapshot) => snapshot,
      initialValue: null,
      refetchMode: "replace",
    }),
  });
  const snapshot = query.data ?? undefined;
  const sources: SourceStates = snapshot?.sources ?? {};
  return {
    bundle: snapshot?.bundle,
    sources,
    isComplete: snapshot?.complete === true,
    fromCache: snapshot?.fromCache === true,
    error: query.error,
  };
}
