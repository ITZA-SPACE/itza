import type { Priorities, Scenario } from "@itza/engine/contracts";
import {
  PRESET_DELTAS,
  PRESET_IDS,
  type PresetId,
  presetScenario,
  SLIDER_LIMITS,
  sliderScenario,
} from "@itza/engine/decisions";

export { PRESET_IDS, type PresetId, SLIDER_LIMITS };

export const RAIN_STEP = 5;
export const TEMP_STEP = 0.5;

export const HISTORY: Scenario = { id: "history", kind: "history" };
export const CUSTOM_ID = "custom";

export const PRIORITY_KEYS = [
  "water",
  "soil_health",
  "nitrogen",
  "erosion",
  "forage",
  "income",
  "pest_break",
] as const satisfies readonly (keyof Priorities)[];

export interface Deltas {
  rainPct: number;
  tempC: number;
}

/** What the sliders show for the scenario in the store; null when it is not expressed in sliders. */
export function deltasOf(scenario: Scenario): Deltas | null {
  if (scenario.kind === "history") return { rainPct: 0, tempC: 0 };
  if (isPreset(scenario.id)) {
    const { rainPct, tempC } = PRESET_DELTAS[scenario.id];
    return { rainPct, tempC };
  }
  if (scenario.kind === "slider")
    return { rainPct: scenario.delta_rain_pct ?? 0, tempC: scenario.delta_temp_c ?? 0 };
  return null;
}

export function isPreset(id: string): id is PresetId {
  return (PRESET_IDS as readonly string[]).includes(id);
}

/** The scenario for slider positions: real past weather when both are zero. */
export function scenarioOf({ rainPct, tempC }: Deltas): Scenario {
  return rainPct === 0 && tempC === 0 ? HISTORY : sliderScenario(CUSTOM_ID, rainPct, tempC);
}

export function presetFor(id: PresetId, latitude: number): Scenario {
  return presetScenario(id, latitude);
}

export function springOnly(id: string): boolean {
  return isPreset(id) && PRESET_DELTAS[id].springOnly;
}

/** The scenarios the robustness readout tests: the three quick scenarios, plus a custom change. */
export function stressScenarios(current: Scenario, latitude: number): Scenario[] {
  const stress = PRESET_IDS.map((id) => presetScenario(id, latitude));
  return current.kind === "slider" && current.id === CUSTOM_ID ? [...stress, current] : stress;
}
