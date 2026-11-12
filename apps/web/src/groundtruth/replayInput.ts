import type { EngineInput, Rotation } from "@itza/engine/contracts";
import type { FieldWork } from "../state";
import { dayOfYear, effectiveSoil } from "./overrides";

const MAX_SEASONS = 8;
const PREVIEW_DRAWS = 50;
const PREVIEW_SEED = 1;

/**
 * The rotation to replay: the one the farmer entered, else the seasons they confirmed (the last
 * eight), with each season's observed planting date as its sowing day. Null when there is neither.
 */
export function rotationToReplay(work: FieldWork): Rotation | null {
  if (work.inputs.currentRotation) return work.inputs.currentRotation;
  const recent = work.confirmedHistory.slice(-MAX_SEASONS);
  if (recent.length === 0) return null;
  const seasons = recent.map(({ season, crop }) => {
    const planted = work.groundTruth.plantingDates[season];
    return planted ? { crop, sowing_doy: dayOfYear(planted) } : { crop };
  });
  return { id: "your-field", name: "Your field", seasons } as Rotation;
}

/** Engine input for a replay of the field as the farmer described it, observations included. */
export function replayInput(work: FieldWork): EngineInput | null {
  const rotation = rotationToReplay(work);
  if (!rotation) return null;
  return {
    schema: "engine-input/1.0",
    rotations: [rotation],
    baseline: rotation,
    soil: effectiveSoil(work.inputs.soil, work.groundTruth.soilTest),
    priorities: work.priorities,
    constraints: work.inputs.constraints,
    scenario: { id: "history", kind: "history" },
    seed: PREVIEW_SEED,
    monte_carlo_draws: PREVIEW_DRAWS,
  };
}
