import type { Soil } from "@itza/engine/contracts";
import type { GroundTruth as ObservationCounts } from "@itza/engine/decisions";
import type { CopyKey } from "../copy";
import type { FieldWork, GroundTruth } from "../state";

/** Source id of a soil value the farmer measured; the engine treats `user_*` sources as observed. */
export const SOIL_TEST_SOURCE = "user_soil_test";

export interface SoilField {
  key: string;
  label: CopyKey;
  unit: CopyKey;
  min: number;
  max: number;
  step: number;
}

/** The soil test form, in reading order. Keys are the soil property names the engine reads. */
export const SOIL_FIELDS: readonly SoilField[] = [
  {
    key: "clay_pct",
    label: "groundTruth.soil.clay",
    unit: "groundTruth.unit.pct",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "sand_pct",
    label: "groundTruth.soil.sand",
    unit: "groundTruth.unit.pct",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "soc_pct",
    label: "groundTruth.soil.carbon",
    unit: "groundTruth.unit.pct",
    min: 0,
    max: 20,
    step: 0.1,
  },
  {
    key: "ph",
    label: "groundTruth.soil.ph",
    unit: "groundTruth.unit.ph",
    min: 3,
    max: 10,
    step: 0.1,
  },
  {
    key: "awc_mm_per_m",
    label: "groundTruth.soil.awc",
    unit: "groundTruth.unit.mmPerM",
    min: 20,
    max: 300,
    step: 5,
  },
  {
    key: "depth_cm",
    label: "groundTruth.soil.depth",
    unit: "groundTruth.unit.cm",
    min: 10,
    max: 300,
    step: 5,
  },
];

/** Soil used by the engine: the farmer's soil test wins over the satellite or default value. */
export function effectiveSoil(base: Soil, soilTest: Soil): Soil {
  return { ...base, ...soilTest };
}

/** Turns typed numbers into soil values tagged as observed by the user. */
export function soilTestOf(values: Record<string, number>): Soil {
  const soil: Soil = {};
  for (const [key, value] of Object.entries(values)) {
    soil[key] = { value, source: SOIL_TEST_SOURCE, confidence: "high" };
  }
  return soil;
}

/** How many observations of each kind the farmer gave, as the confidence calculation counts them. */
export function observationCounts(truth: GroundTruth): ObservationCounts {
  return {
    plantingDates: Object.keys(truth.plantingDates).length,
    yields: Object.keys(truth.yields).length,
    irrigationEvents: truth.irrigationEvents.length,
  };
}

/** What the engine needs from the farmer's observations: the soil to use and the counts. */
export function engineGroundTruth(work: FieldWork): { soil: Soil; counts: ObservationCounts } {
  return {
    soil: effectiveSoil(work.inputs.soil, work.groundTruth.soilTest),
    counts: observationCounts(work.groundTruth),
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
  /** Copy key for the thing overridden, or free text such as a season. */
  label: CopyKey;
  detail?: string;
  value: string;
  /** The satellite or default value this replaced, if there was one. */
  replaced: string | null;
}

/** What the farmer overrode, derived from the saved observations, so it always matches the store. */
export function changeLog(work: FieldWork): ChangeEntry[] {
  const { soilTest, plantingDates, harvestDates, yields, irrigationEvents } = work.groundTruth;
  const entries: ChangeEntry[] = [];
  for (const field of SOIL_FIELDS) {
    const observed = soilTest[field.key];
    if (!observed) continue;
    const before = work.inputs.soil[field.key];
    entries.push({
      id: `soil:${field.key}`,
      kind: "soil",
      label: field.label,
      value: String(observed.value),
      replaced: before ? `${before.value} (${before.source})` : null,
    });
  }
  for (const [season, date] of Object.entries(plantingDates)) {
    entries.push({
      id: `planting:${season}`,
      kind: "planting",
      label: "groundTruth.log.planting",
      detail: season,
      value: date,
      replaced: null,
    });
  }
  for (const [season, date] of Object.entries(harvestDates)) {
    entries.push({
      id: `harvest:${season}`,
      kind: "harvest",
      label: "groundTruth.log.harvest",
      detail: season,
      value: date,
      replaced: null,
    });
  }
  for (const [season, amount] of Object.entries(yields)) {
    entries.push({
      id: `yield:${season}`,
      kind: "yield",
      label: "groundTruth.log.yield",
      detail: season,
      value: String(amount),
      replaced: null,
    });
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

/** The store changes that clear one entry of the change log, restoring the satellite or default value. */
export function withoutEntry(truth: GroundTruth, entry: ChangeEntry): Partial<GroundTruth> {
  const [, key = ""] = entry.id.split(":");
  switch (entry.kind) {
    case "soil": {
      const { [key]: _removed, ...soilTest } = truth.soilTest;
      return { soilTest };
    }
    case "planting": {
      const { [key]: _removed, ...plantingDates } = truth.plantingDates;
      return { plantingDates };
    }
    case "harvest": {
      const { [key]: _removed, ...harvestDates } = truth.harvestDates;
      return { harvestDates };
    }
    case "yield": {
      const { [key]: _removed, ...yields } = truth.yields;
      return { yields };
    }
    case "irrigation":
      return { irrigationEvents: truth.irrigationEvents.filter((_, i) => i !== Number(key)) };
  }
}
