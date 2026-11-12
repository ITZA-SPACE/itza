import { buildEvidenceCards } from "@itza/engine/decisions";
import { soilParams } from "@itza/engine/physics";
import { useEffect, useMemo, useState } from "react";
import { engine } from "../compare/engine";
import { useFieldBundle } from "../data";
import { effectiveSoil } from "../inputs/soil";
import { useSettled } from "../lib/useSettled";
import { useFieldStore } from "../state";
import { observationCounts } from "./overrides";
import { replayInput } from "./replayInput";

export interface ReplayPreview {
  /** Mean water-balance score over the replayed seasons, 0 to 1. */
  waterBalance: number;
  /** Season score of the replayed rotation, 0 to 1. */
  score: number;
  confidence: { level: "high" | "medium" | "low"; reasons: string[] };
  /** Water the soil can hold in a nominal 1 m root zone, mm (TAW). */
  tawMm: number;
}

export type PreviewState =
  | { status: "no-field" | "no-rotation" | "loading-data" | "running" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: ReplayPreview };

const SETTLE_MS = 800;

/**
 * Replays the field with the farmer's observations and returns what they change: the water the
 * soil can hold, the water-balance and season scores, and the confidence label. It reruns whenever
 * a soil value or an observation changes.
 */
export function useReplayPreview(): PreviewState {
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const inputs = useFieldStore((s) => s.inputs);
  const groundTruth = useFieldStore((s) => s.groundTruth);
  const confirmedHistory = useFieldStore((s) => s.confirmedHistory);
  const priorities = useFieldStore((s) => s.priorities);
  const { bundle, isComplete, error } = useFieldBundle(geometry);

  const soil = useMemo(() => effectiveSoil(bundle, inputs.soil), [bundle, inputs.soil]);
  const input = useMemo(
    () => replayInput({ inputs, groundTruth, confirmedHistory, priorities }, soil),
    [inputs, groundTruth, confirmedHistory, priorities, soil],
  );

  const [state, setState] = useState<PreviewState>({ status: "no-field" });
  useEffect(() => {
    if (!geometry) return setState({ status: "no-field" });
    if (!input) return setState({ status: "no-rotation" });
    if (error) return setState({ status: "error", message: String(error) });
    if (!bundle || !isComplete) return setState({ status: "loading-data" });

    let current = true;
    setState({ status: "running" });
    engine()
      .runReplay({ bundle, input })
      .then((output) => {
        if (!current) return;
        const result = output.results[0];
        const card = buildEvidenceCards({
          bundle,
          input,
          output,
          groundTruth: observationCounts(groundTruth),
        })[0];
        if (!result || !card) throw new Error("The replay returned no result.");
        setState({
          status: "ready",
          preview: {
            score: result.score,
            waterBalance:
              result.seasons.reduce((sum, s) => sum + s.criteria.water_balance, 0) /
              Math.max(1, result.seasons.length),
            confidence: { level: card.confidence.level, reasons: [...card.confidence.reasons] },
            tawMm: soilParams(input.soil).awcMmPerM,
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
  }, [geometry, input, bundle, isComplete, error, groundTruth]);
  return state;
}
