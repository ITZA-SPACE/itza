import type { FutureResult } from "@itza/engine/worker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { engine } from "../compare/engine";
import type { CompareState } from "../compare/useCompare";
import { config } from "../lib/config";

/** A `/v1/projection` response; the engine checks its shape. */
export interface ProjectionPayload {
  gaps?: { var: string; reason: string; severity: string }[];
  [key: string]: unknown;
}

async function fetchProjection(
  heroId: string | undefined,
  centroid: [number, number],
  signal: AbortSignal,
): Promise<ProjectionPayload> {
  const [lon, lat] = centroid;
  const url = heroId
    ? `${import.meta.env.BASE_URL}bundles/${heroId}/projection.json`.replace(/\/\//g, "/")
    : `${config.scienceApiUrl}/v1/projection?lat=${lat}&lon=${lon}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as ProjectionPayload;
}

/**
 * The monthly 2050 change factors for the field: a hero field's precomputed response, or the science
 * API's `/v1/projection` for the field's centre.
 */
export function useProjection(heroId: string | undefined, centroid: [number, number] | undefined) {
  return useQuery({
    queryKey: ["projection", heroId ?? null, centroid ?? null],
    enabled: centroid !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    networkMode: "offlineFirst",
    queryFn: ({ signal }) => fetchProjection(heroId, centroid as [number, number], signal),
  });
}

/**
 * The comparison replayed under the three scenarios at `progress` of the way to 2050. Waits for the
 * worker to hold the field's comparison; earlier answers stay on screen while the slider moves.
 */
export function useFuture(
  compare: Pick<CompareState, "status" | "key" | "refreshing">,
  payload: ProjectionPayload | undefined,
  progress: number,
) {
  return useQuery<FutureResult>({
    queryKey: ["future", compare.key, payload, progress],
    enabled: compare.status === "ready" && !compare.refreshing && payload !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => engine().future({ payload, progress }),
  });
}
