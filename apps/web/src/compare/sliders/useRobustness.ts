import type { EngineInput } from "@itza/engine/contracts";
import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSettled } from "../../lib/useSettled";
import { useFieldStore } from "../../state";
import type { CompareState } from "../useCompare";
import { rankRobustness } from "./robustness";
import { robustnessEngine } from "./robustnessEngine";
import { HISTORY, stressScenarios } from "./scenarios";

const SETTLE_MS = 800;

interface ScenarioScores {
  scenarioId: string;
  scores: Map<string, number>;
}

/**
 * Tests the rotations on screen against a drought year, a hot spring and a wet spring (and the
 * custom change, if there is one), each replayed in the second worker with the Monte Carlo draws
 * skipped: the score does not depend on them. The same rotations are replayed every time, because
 * the candidates the engine proposes depend on the weather. Starts once the comparison on screen is done, and again
 * when the priorities have rested.
 */
export function useRobustness(state: CompareState) {
  const scenario = useFieldStore((s) => s.scenario);
  const latitude = useFieldStore((s) => s.field?.centroid[1]);
  const priorities = useSettled(
    useFieldStore((s) => s.priorities),
    SETTLE_MS,
  );
  const { view, requestFor, key } = state;
  const definitions = view?.definitions;
  const packId = view?.packId;
  const idle =
    state.status === "ready" &&
    !state.refreshing &&
    requestFor !== null &&
    definitions !== undefined;

  const scenarios = useMemo(
    () => (latitude === undefined ? [] : [HISTORY, ...stressScenarios(scenario, latitude)]),
    [scenario, latitude],
  );

  const { scores, error } = useQueries({
    queries: scenarios.map((sc) => ({
      queryKey: ["robustness", key, priorities, sc],
      enabled: idle,
      staleTime: Number.POSITIVE_INFINITY,
      placeholderData: keepPreviousData,
      retry: false,
      queryFn: async (): Promise<ScenarioScores> => {
        if (!requestFor || !definitions || !packId) throw new Error("no comparison");
        const request = requestFor(sc, 0);
        const result = await robustnessEngine().runReplay({
          bundle: request.bundle,
          input: {
            ...request.input,
            priorities,
            rotations: definitions as EngineInput["rotations"],
          },
          packId,
        });
        return {
          scenarioId: sc.id,
          scores: new Map(result.results.map((r) => [r.rotation_id, r.score])),
        };
      },
    })),
    combine: (results) => ({
      scores: results.map((r) => r.data),
      error: results.find((r) => r.error)?.error ?? null,
    }),
  });

  const loaded = scores.length > 0 && scores.every((d) => d !== undefined);
  const rows = useMemo(() => {
    if (!view || !loaded) return null;
    const data = scores as ScenarioScores[];
    const history = data.find((d) => d.scenarioId === HISTORY.id);
    if (!history) return null;
    const stressed = new Map(
      data.filter((d) => d.scenarioId !== HISTORY.id).map((d) => [d.scenarioId, d.scores]),
    );
    return rankRobustness(history.scores, stressed, view.rotations, view.baselineId);
  }, [view, loaded, scores]);

  return { rows, error, pending: !loaded && error === null };
}
