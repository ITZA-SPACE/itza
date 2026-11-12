import { buildEvidenceCards } from "@itza/engine/decisions";
import { soilParams } from "@itza/engine/physics";
import { createReplayClient } from "@itza/engine/worker";
import ReplayWorker from "@itza/engine/worker/entry?worker";
import { useEffect, useMemo, useState } from "react";
import { type BundleSnapshot, HERO_FIELDS, useFieldBundle } from "../data";
import { useFieldStore } from "../state";
import { observationCounts } from "./overrides";
import { replayInput } from "./replayInput";

export interface ReplayPreview {
  /** Mean water-balance score over the replayed seasons, 0 to 1. */
  waterBalance: number;
  /** Season score of the replayed rotation, 0 to 1. */
  score: number;
  confidence: { level: "high" | "medium" | "low"; reasons: string[] };
  /** Water the soil can hold in the top metre of roots, mm (TAW). */
  tawMm: number;
}

export type PreviewState =
  | { status: "no-field" | "no-rotation" | "loading-data" | "running" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: ReplayPreview };

let client: ReturnType<typeof createReplayClient> | undefined;
const replayClient = () => {
  client ??= createReplayClient(new ReplayWorker());
  return client;
};

const MAX_ROOT_DEPTH_M = 1;

function heroIdFor(centroid: [number, number]): string | undefined {
  return HERO_FIELDS.find(({ geometry }) => {
    const ring = (geometry.coordinates as number[][][])[0] ?? [];
    const lons = ring.map((p) => p[0] as number);
    const lats = ring.map((p) => p[1] as number);
    return (
      centroid[0] >= Math.min(...lons) &&
      centroid[0] <= Math.max(...lons) &&
      centroid[1] >= Math.min(...lats) &&
      centroid[1] <= Math.max(...lats)
    );
  })?.id;
}

/**
 * Replays the field with the farmer's observations and returns what changes with them: the water
 * the soil can hold, the water-balance and season scores, and the confidence label. It reruns
 * whenever an observation is saved.
 */
export function useReplayPreview(): PreviewState {
  const field = useFieldStore((s) => s.field);
  const inputs = useFieldStore((s) => s.inputs);
  const groundTruth = useFieldStore((s) => s.groundTruth);
  const confirmedHistory = useFieldStore((s) => s.confirmedHistory);
  const priorities = useFieldStore((s) => s.priorities);
  const scenario = useFieldStore((s) => s.scenario);

  const heroId = field ? heroIdFor(field.centroid) : undefined;
  const { bundle, isComplete, error } = useFieldBundle(
    field?.geometry as Parameters<typeof useFieldBundle>[0],
    heroId ? { heroId } : {},
  );
  const input = useMemo(
    () => replayInput({ inputs, groundTruth, confirmedHistory, priorities, scenario }),
    [inputs, groundTruth, confirmedHistory, priorities, scenario],
  );

  const [state, setState] = useState<PreviewState>({ status: "no-field" });
  useEffect(() => {
    if (!field) return setState({ status: "no-field" });
    if (!input) return setState({ status: "no-rotation" });
    if (error) return setState({ status: "error", message: String(error) });
    const ready = isComplete ? (bundle as BundleSnapshot["bundle"] | undefined) : undefined;
    if (!ready) return setState({ status: "loading-data" });

    let current = true;
    setState({ status: "running" });
    replayClient()
      .runReplay({ bundle: ready, input })
      .then((output) => {
        if (!current) return;
        const result = output.results[0];
        const card = buildEvidenceCards({
          bundle: ready,
          input,
          output,
          groundTruth: observationCounts(groundTruth),
        })[0];
        if (!result || !card) throw new Error("The replay returned no result.");
        const seasons = result.seasons;
        const params = soilParams(input.soil);
        setState({
          status: "ready",
          preview: {
            score: result.score,
            waterBalance:
              seasons.reduce((sum, s) => sum + s.criteria.water_balance, 0) /
              Math.max(1, seasons.length),
            confidence: { level: card.confidence.level, reasons: [...card.confidence.reasons] },
            tawMm: params.awcMmPerM * Math.min(MAX_ROOT_DEPTH_M, params.maxRootDepthM),
          },
        });
      })
      .catch((e: unknown) => {
        if (current)
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      current = false;
    };
  }, [field, input, bundle, isComplete, error, groundTruth]);
  return state;
}
