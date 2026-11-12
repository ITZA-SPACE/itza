import type { FieldBundle, Priorities, Rotation, Scenario } from "@itza/engine/contracts";
import type { CompareRequest, CompareResult, TimelineResult, Weighted } from "@itza/engine/worker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { designRotation } from "../builder/design";
import { useBuilderStore } from "../builder/designStore";
import { useFieldBundle } from "../data";
import { observationCounts } from "../groundtruth/overrides";
import { effectiveSoil } from "../inputs/soil";
import { useSettled } from "../lib/useSettled";
import { type FarmerInputs, type GroundTruth, useFieldStore } from "../state";
import { type BaselineSource, baselineOf } from "./baseline";
import { engine } from "./engine";

const SETTLE_MS = 800;
const SEED = 42;
const DRAWS = 200;
const UNKNOWN_CROP = /Unknown crop/;

/**
 * Key of the comparison the worker holds now. `reweigh`, `timeline` and `whyNot` answer from it, so
 * a cached comparison for another field is stale and must run again before they are asked.
 */
let workerKey: string | null = null;

function buildRequest(
  bundle: FieldBundle,
  inputs: FarmerInputs,
  priorities: Priorities,
  scenario: Scenario,
  baseline: Rotation | null,
  drawCount: number,
  design: readonly string[] | null,
  groundTruth: GroundTruth,
): CompareRequest {
  return {
    bundle,
    input: {
      schema: "engine-input/1.0",
      soil: inputs.soil,
      priorities,
      constraints: inputs.constraints,
      scenario,
      seed: SEED,
      monte_carlo_draws: drawCount,
      ...(baseline ? { baseline } : {}),
    },
    ...(design ? { designs: [designRotation(design)] } : {}),
    groundTruth: observationCounts(groundTruth),
  };
}

export type CompareStatus = "no-field" | "loading-data" | "computing" | "error" | "ready";

export interface CompareState {
  status: CompareStatus;
  /** Results with the current priorities applied. */
  view: (CompareResult & Weighted) | null;
  /** Where the baseline came from; `none` means the cards have nothing to be compared with. */
  baselineSource: BaselineSource;
  /** The current rotation was found but names a crop the engine does not know. */
  baselineRejected: boolean;
  error: Error | null;
  /** Key of this comparison, for queries that depend on it. */
  key: string | null;
  /** Key of everything except the weather scenario, for results kept per scenario. */
  dataKey: string | null;
  /** The comparison is being run again (new weather): the view shows the previous one, and
   * queries that ask the worker about it should wait. */
  refreshing: boolean;
  /** The request for another scenario of the same field and inputs; null until the data is in. */
  requestFor: ((scenario: Scenario, drawCount?: number) => CompareRequest) | null;
}

/**
 * The comparison for the selected field: waits for its data, then asks the engine's worker for
 * candidates, a replay of each and the evidence cards. Moving the priorities only re-weighs.
 */
export function useCompare(): CompareState {
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle, isComplete } = useFieldBundle(geometry);
  const inputs = useFieldStore((s) => s.inputs);
  const history = useFieldStore((s) => s.confirmedHistory);
  const scenario = useFieldStore((s) => s.scenario);
  const priorities = useFieldStore((s) => s.priorities);
  const groundTruth = useFieldStore((s) => s.groundTruth);
  const design = useBuilderStore((s) => s.scored);

  // The soil the engine gets: SoilGrids values from the bundle with the farmer's own on top.
  const soil = useMemo(() => effectiveSoil(bundle, inputs.soil), [bundle, inputs.soil]);

  const baseline = useMemo(
    () =>
      bundle
        ? baselineOf({ inputs, confirmedHistory: history }, bundle)
        : { rotation: null, source: "none" as const },
    [bundle, inputs, history],
  );

  const ready = geometry !== undefined && bundle !== undefined && isComplete;
  const dataKey = ready
    ? JSON.stringify([geometry, soil, inputs.constraints, baseline.rotation, groundTruth, design])
    : null;
  const key = dataKey ? JSON.stringify([dataKey, scenario]) : null;

  const compared = useQuery({
    queryKey: ["compare", key],
    enabled: ready,
    staleTime: (query) => (query.queryKey[1] === workerKey ? Number.POSITIVE_INFINITY : 0),
    // The previous results stay on screen while another weather scenario of the same field replays.
    placeholderData: (previous) => (previous?.dataKey === dataKey ? previous : undefined),
    retry: false,
    queryFn: async () => {
      if (!bundle) throw new Error("no bundle");
      workerKey = null;
      try {
        const result = await engine().compare(
          buildRequest(
            bundle,
            { ...inputs, soil },
            priorities,
            scenario,
            baseline.rotation,
            DRAWS,
            design,
            groundTruth,
          ),
        );
        workerKey = key;
        return { result, rejected: false, priorities, dataKey };
      } catch (error) {
        // A current rotation with a crop the region pack lacks should not block the comparison.
        if (baseline.rotation && error instanceof Error && UNKNOWN_CROP.test(error.message)) {
          const result = await engine().compare(
            buildRequest(
              bundle,
              { ...inputs, soil },
              priorities,
              scenario,
              null,
              DRAWS,
              design,
              groundTruth,
            ),
          );
          workerKey = key;
          return { result, rejected: true, priorities, dataKey };
        }
        throw error;
      }
    },
  });

  const usedPriorities = compared.data?.priorities;
  const changed =
    compared.isSuccess && JSON.stringify(usedPriorities) !== JSON.stringify(priorities);
  const reweighed = useQuery({
    queryKey: ["reweigh", key, priorities],
    enabled: changed,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    queryFn: () => engine().reweigh(priorities),
  });

  const status: CompareStatus =
    geometry === undefined
      ? "no-field"
      : !ready
        ? "loading-data"
        : compared.isError
          ? "error"
          : compared.isSuccess
            ? "ready"
            : "computing";
  const result = compared.data?.result ?? null;
  const view = result ? { ...result, ...(changed && reweighed.data ? reweighed.data : {}) } : null;
  const rejected = compared.data?.rejected === true;
  return {
    status,
    view,
    baselineSource: rejected ? "none" : baseline.source,
    baselineRejected: rejected,
    error: compared.error,
    key,
    dataKey,
    refreshing: compared.isFetching,
    requestFor:
      ready && bundle
        ? (other, drawCount = DRAWS) =>
            buildRequest(
              bundle,
              { ...inputs, soil },
              priorities,
              other,
              rejected ? null : baseline.rotation,
              drawCount,
              design,
              groundTruth,
            )
        : null,
  };
}

/** The chosen season, day by day, for every rotation compared. */
export function useTimeline(key: string | null, season: string | null) {
  return useQuery<TimelineResult>({
    queryKey: ["timeline", key, season],
    enabled: key !== null && season !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => engine().timeline(season as string),
  });
}

/** Why a crop is, or is not, among the candidates. */
export function useWhyNot(key: string | null, crop: string | null) {
  return useQuery({
    queryKey: ["why-not", key, crop],
    enabled: key !== null && crop !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => engine().whyNot(crop as string),
  });
}
