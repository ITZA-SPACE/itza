import type { Soil } from "@itza/engine/contracts";
import type { GroundTruth as ObservationCounts } from "@itza/engine/decisions";
import type { CopyKey } from "../copy";
import { FARMER_SOURCE, SOIL_FIELDS, type SoilKey } from "../inputs/soil";
import type { FieldWork, GroundTruth } from "../state";

/** How many observations of each kind the farmer gave, as the confidence calculation counts them. */
export function observationCounts(truth: GroundTruth): ObservationCounts {
  return {
    plantingDates: Object.keys(truth.plantingDates).length,
    yields: Object.keys(truth.yields).length,
    irrigationEvents: truth.irrigationEvents.length,
  };
}

/** Day of the year (1 to 366) of an ISO date, which is how the engine takes a sowing day. */
export function dayOfYear(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
}

export type OverrideKind = "soil" | "planting" | "harvest" | "yield" | "irrigation";

export interface ChangeEntry {
  id: string;
  kind: OverrideKind;
  /** Copy key for the thing overridden. */
  label: CopyKey;
  /** Extra text such as the season. */
  detail?: string;
  value: string;
  /** The satellite or default value this replaced, if there was one. */
  replaced: string | null;
}

/**
 * Everything the farmer overrode, derived from the store so it always matches it: the soil values
 * they typed in the soil form (source `farmer`), then dates, yields and irrigation.
 */
export function changeLog(
  work: Pick<FieldWork, "inputs" | "groundTruth">,
  bundleSoil: Soil | undefined,
): ChangeEntry[] {
  const { plantingDates, harvestDates, yields, irrigationEvents } = work.groundTruth;
  const entries: ChangeEntry[] = [];
  for (const field of SOIL_FIELDS) {
    const observed = work.inputs.soil[field.key];
    if (observed?.source !== FARMER_SOURCE) continue;
    const before = bundleSoil?.[field.key];
    entries.push({
      id: `soil:${field.key}`,
      kind: "soil",
      label: field.label,
      value: String(observed.value),
      replaced: before ? `${before.value} (${before.source})` : null,
    });
  }
  const seasonal = [
    ["planting", plantingDates, "groundTruth.log.planting"],
    ["harvest", harvestDates, "groundTruth.log.harvest"],
    ["yield", yields, "groundTruth.log.yield"],
  ] as const;
  for (const [kind, values, label] of seasonal) {
    for (const [season, value] of Object.entries(values)) {
      entries.push({
        id: `${kind}:${season}`,
        kind,
        label,
        detail: season,
        value: String(value),
        replaced: null,
      });
    }
  }
  irrigationEvents.forEach((event, index) => {
    entries.push({
      id: `irrigation:${index}`,
      kind: "irrigation",
      label: "groundTruth.log.irrigation",
      detail: event.date,
      value: `${event.mm} mm`,
      replaced: null,
    });
  });
  return entries;
}

/** The soil property a soil entry of the change log is about. */
export function soilKeyOf(entry: ChangeEntry): SoilKey {
  return entry.id.slice("soil:".length) as SoilKey;
}

/** The ground-truth changes that clear one dated, yield or irrigation entry of the change log. */
export function withoutEntry(truth: GroundTruth, entry: ChangeEntry): Partial<GroundTruth> {
  const key = entry.id.slice(entry.id.indexOf(":") + 1);
  const without = <T>(record: Record<string, T>) => {
    const { [key]: _removed, ...rest } = record;
    return rest;
  };
  switch (entry.kind) {
    case "planting":
      return { plantingDates: without(truth.plantingDates) };
    case "harvest":
      return { harvestDates: without(truth.harvestDates) };
    case "yield":
      return { yields: without(truth.yields) };
    case "irrigation":
      return { irrigationEvents: truth.irrigationEvents.filter((_, i) => i !== Number(key)) };
    case "soil":
      return {};
  }
}
