import { baselineOf } from "../compare/baseline";
import type { ConfirmedSeason, FarmerInputs } from "../state";

export type RotationSource = "entered" | "confirmed" | "inferred" | "none";

export const MAX_SEASONS = 6;

/**
 * The rotation the form shows: what the farmer entered, else the pattern of the seasons they
 * confirmed, else what the satellites saw (Field Memory's pack crop ids), else nothing.
 */
export function rotationProposal(
  inputs: Pick<FarmerInputs, "currentRotation">,
  history: readonly ConfirmedSeason[],
  inferredCrops: readonly string[],
): { crops: string[]; source: RotationSource } {
  const base = baselineOf(
    {
      inputs: {
        ...inputs,
        soil: {},
        constraints: { irrigation: { level: "none" }, livestock: false },
      },
      confirmedHistory: [...history],
    },
    { phenology: [] },
  );
  if (base.rotation) {
    return {
      crops: base.rotation.seasons.map((s) => s.crop),
      source: base.source === "entered" ? "entered" : "confirmed",
    };
  }
  if (inferredCrops.length > 0)
    return { crops: inferredCrops.slice(0, MAX_SEASONS), source: "inferred" };
  return { crops: [], source: "none" };
}

/** The farmer set the rotation: entered it or confirmed their history. */
export function rotationIsSet(
  inputs: Pick<FarmerInputs, "currentRotation">,
  history: readonly ConfirmedSeason[],
): boolean {
  return inputs.currentRotation !== null || history.length > 0;
}
