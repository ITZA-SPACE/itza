import { experimental_streamedQuery as streamedQuery, useQuery } from "@tanstack/react-query";
import { loadFieldBundle } from "./defaults";
import type { FieldGeometry } from "./geometry";
import type { BundleSnapshot, LoadOptions, SourceStates } from "./types";

/**
 * Loads a field bundle progressively. `bundle` and `sources` update each time a source finishes;
 * `isComplete` is true once every source has finished (failed sources appear in `bundle.gaps`).
 */
export function useFieldBundle(
  geometry: FieldGeometry | undefined,
  options: Omit<LoadOptions, "signal"> = {},
) {
  const query = useQuery<BundleSnapshot | null>({
    queryKey: ["field-bundle", geometry, options.heroId ?? null, options.period ?? null],
    enabled: geometry !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
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
