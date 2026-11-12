import type { FieldBundle, Rotation } from "@itza/engine/contracts";
import type { ConfirmedSeason, FieldWork } from "../state";

const MAX_SEASONS = 6;
const MAX_PERIOD = 4;

/** The shortest pattern that, repeated, gives the sequence (`[a, b, a, b]` is `[a, b]`). */
export function repeatingPattern<T>(sequence: readonly T[]): T[] {
  for (let period = 1; period < sequence.length && period <= MAX_PERIOD; period++) {
    if (sequence.every((value, i) => value === sequence[i % period]))
      return sequence.slice(0, period);
  }
  return [...sequence];
}

function rotationOf(crops: readonly string[]): Rotation | null {
  const pattern = repeatingPattern(crops.slice(-MAX_SEASONS));
  if (pattern.length === 0) return null;
  return {
    id: "current",
    seasons: pattern.map((crop) => ({ crop })) as unknown as Rotation["seasons"],
  };
}

export type BaselineSource = "entered" | "confirmed" | "inferred" | "none";

/**
 * The farmer's current rotation, the baseline of every comparison: what they entered, else the
 * seasons they confirmed, else what the satellites saw on the field (the bundle's inferred history).
 */
export function baselineOf(
  work: Pick<FieldWork, "inputs" | "confirmedHistory">,
  bundle: Pick<FieldBundle, "phenology">,
): { rotation: Rotation | null; source: BaselineSource } {
  if (work.inputs.currentRotation)
    return { rotation: work.inputs.currentRotation, source: "entered" };
  const confirmed = [...work.confirmedHistory]
    .sort((a: ConfirmedSeason, b: ConfirmedSeason) => a.season.localeCompare(b.season))
    .map((s) => s.crop);
  const fromConfirmed = rotationOf(confirmed);
  if (fromConfirmed) return { rotation: fromConfirmed, source: "confirmed" };
  const inferred = [...bundle.phenology]
    .sort((a, b) => a.season.localeCompare(b.season))
    .flatMap((p) => (p.inferred ? [p.inferred.crop] : []));
  const fromInferred = rotationOf(inferred);
  return fromInferred
    ? { rotation: fromInferred, source: "inferred" }
    : { rotation: null, source: "none" };
}
