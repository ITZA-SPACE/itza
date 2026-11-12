import type { Constraints, Rotation, Soil } from "@itza/engine/contracts";
import { useFieldStore } from "../state";
import { DEFAULT_SOURCE, FARMER_SOURCE, type ShownSoil, SOIL_FIELDS, type SoilKey } from "./soil";

/**
 * How farmer inputs reach the store. The form uses these, and so can the assistant's ConfirmForm:
 * values apply only through them, after the farmer confirms.
 */

/** Sets the current rotation from crop ids, or clears it (null) so the confirmed history is used again. */
export function setCurrentRotation(crops: readonly string[] | null): void {
  const store = useFieldStore.getState();
  const rotation: Rotation | null =
    crops && crops.length > 0
      ? ({ id: "current", seasons: crops.map((crop) => ({ crop })) } as unknown as Rotation)
      : null;
  store.setInputs({ currentRotation: rotation });
}

/** Sets one soil property as the farmer's own value, or removes the override (null) to go back to the satellite value. */
export function setSoilValue(key: SoilKey, value: number | null): void {
  const store = useFieldStore.getState();
  const { [key]: _removed, ...rest } = store.inputs.soil;
  const soil: Soil =
    value === null
      ? rest
      : { ...rest, [key]: { value, source: FARMER_SOURCE, confidence: "high" } };
  store.setInputs({ soil });
}

/** Changes some of the hard constraints. */
export function setConstraints(patch: Partial<Constraints>): void {
  const store = useFieldStore.getState();
  store.setInputs({ constraints: { ...store.inputs.constraints, ...patch } });
}

/**
 * Accepts the defaults on show: the rotation read from the satellites (when none is set) and every
 * soil value that is only a default are saved as they are, labeled as defaults, so the comparison
 * uses exactly what the farmer saw.
 */
export function acceptDefaults(
  rotationCrops: readonly string[],
  shown: Record<SoilKey, ShownSoil>,
): void {
  const store = useFieldStore.getState();
  const soil: Soil = { ...store.inputs.soil };
  for (const { key } of SOIL_FIELDS) {
    const s = shown[key];
    if (s.origin === "default" && !soil[key]) {
      soil[key] = { value: s.value, source: DEFAULT_SOURCE, confidence: "low" };
    }
  }
  store.setInputs({
    soil,
    acceptedDefaults: true,
    ...(store.inputs.currentRotation === null &&
    store.confirmedHistory.length === 0 &&
    rotationCrops.length > 0
      ? {
          currentRotation: {
            id: "current",
            seasons: rotationCrops.map((crop) => ({ crop })),
          } as unknown as Rotation,
        }
      : {}),
  });
}
