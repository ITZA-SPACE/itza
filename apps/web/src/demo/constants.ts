import { exampleQuestion } from "../assistant/templates";
import { scenarioOf } from "../compare/sliders/scenarios";
import { HERO_FIELDS } from "../data/hero";
import { fieldMetrics } from "../map/geometry";
import type { FieldGeometry, FieldPolygon } from "../state";

/**
 * The guided demo (C-3, DEMO_STRATEGY.md §3) runs entirely on the Sétif story hero field. Both
 * `HERO_FIELDS` entries are Algeria-area placeholders until #17 ships the real hero bundles and a
 * real US Great Plains proof field; there is no proof-field bundle to fly to yet, so the script's
 * "fly to the proof field" beat (step 8) shows a pending notice instead of a second field.
 */
export const STORY_HERO_ID = HERO_FIELDS[0]?.id ?? "semi-arid-winter-cereal";

// Every hero field is a Polygon in practice (`data/hero.ts`); narrowed here for `fieldMetrics`.
const storyGeometry = HERO_FIELDS[0]?.geometry as FieldPolygon | undefined;

/** The story field as a full `FieldGeometry`, the way drawing it on the map would produce. */
export function storyField(): FieldGeometry {
  if (!storyGeometry) throw new Error("no hero field configured");
  return { id: null, ...fieldMetrics(storyGeometry, "drawn") };
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
