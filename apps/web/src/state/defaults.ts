import type { FieldWork } from "./types";

/** Work state of a field nobody has touched: balanced priorities, history replay, no constraints. */
export function emptyWork(): FieldWork {
  return {
    confirmedHistory: [],
    inputs: {
      currentRotation: null,
      soil: {},
      constraints: { irrigation: { level: "none" }, livestock: false },
    },
    priorities: {
      water: 3,
      soil_health: 3,
      nitrogen: 3,
      erosion: 3,
      forage: 3,
      income: 3,
      pest_break: 3,
    },
    scenario: { id: "history", kind: "history" },
    groundTruth: { plantingDates: {}, harvestDates: {}, yields: {}, irrigationEvents: [] },
  };
}
