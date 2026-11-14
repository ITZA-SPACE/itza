import type { DesignResult } from "@itza/engine/worker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { engine } from "../compare/engine";
import type { CompareState } from "../compare/useCompare";

/**
 * What the rotation on the timeline does on the field: curves per season and rule warnings. The
 * worker holds the comparison's weather, so only the crop ids travel; earlier curves stay on screen
 * while the next ones are computed.
 */
export function useDesignReport(
  compare: Pick<CompareState, "status" | "key" | "refreshing">,
  crops: readonly string[],
) {
  return useQuery<DesignResult>({
    queryKey: ["design", compare.key, crops],
    enabled: compare.status === "ready" && !compare.refreshing && crops.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => engine().design({ crops: [...crops] }),
  });
}
