import { exampleQuestion } from "../assistant/templates";
import { scenarioOf } from "../compare/sliders/scenarios";
import { HERO_FIELDS } from "../data/hero";
import { fieldMetrics } from "../map/geometry";
import type { FieldGeometry, FieldPolygon } from "../state";

/**
 * The guided demo (C-3, DEMO_STRATEGY.md §3) runs on the Sétif story hero field. The Akron proof
 * fields have real bundles too (`HERO_FIELDS`), so the script's "fly to the proof field" beat can
 * open one.
 */
export const STORY_HERO_ID = HERO_FIELDS.find((h) => h.role === "story")?.id ?? "setif-story";

// Every hero field is a Polygon in practice (`data/hero.ts`); narrowed here for `fieldMetrics`.
const storyGeometry = HERO_FIELDS.find((h) => h.role === "story")?.geometry as
  | FieldPolygon
  | undefined;

/** The story field as a full `FieldGeometry`, the way drawing it on the map would produce. */
export function storyField(): FieldGeometry {
  if (!storyGeometry) throw new Error("no hero field configured");
  return { id: null, ...fieldMetrics(storyGeometry, "drawn") };
}

const proofHero = HERO_FIELDS.find((h) => h.role === "proof");

/** The first Akron proof field, the one the script flies to for the validation beat. */
export function proofField(): FieldGeometry {
  if (!proofHero) throw new Error("no proof field configured");
  return { id: null, ...fieldMetrics(proofHero.geometry as FieldPolygon, "drawn") };
}

/** Rainfall −20%, no temperature change: the script's "Options, not orders" slider moment. */
export const DEMO_SCENARIO = scenarioOf({ rainPct: -20, tempC: 0 });

/**
 * The scripted question for the assistant step. The script's exact line ("Why chickpea and not
 * fallow?") names a specific crop pairing that is not guaranteed to be the field's actual top
 * rotation; this uses the real offline template's own worked example for "why is a rotation ranked
 * first", which is guaranteed to match an intent and answer from the field's real data.
 */
export const demoQuestion = (): string => exampleQuestion("explain_evidence");

export const DEMO_STEP_IDS = [
  "title",
  "fieldMemory",
  "climate",
  "replay",
  "assistant",
  "sliders",
  "future",
  "validation",
  "arena",
  "close",
] as const;

export type DemoStepId = (typeof DEMO_STEP_IDS)[number];

/**
 * Seconds the presenter has on each step, from the time slots of DEMO_STRATEGY.md §3 (the last two
 * are trimmed so the whole script stays under three minutes). Play mode advances on this schedule.
 */
export const DEMO_STEP_SECONDS: Record<DemoStepId, number> = {
  title: 15,
  fieldMemory: 20,
  climate: 15,
  replay: 30,
  assistant: 20,
  sliders: 15,
  future: 20,
  validation: 20,
  arena: 10,
  close: 10,
};

/** The whole script, in seconds; must stay below three minutes (T1 exit criterion). */
export const DEMO_TOTAL_SECONDS = DEMO_STEP_IDS.reduce((sum, id) => sum + DEMO_STEP_SECONDS[id], 0);
