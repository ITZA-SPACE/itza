import { LIMITS } from "./schemas";
import { type A2uiMessage, bind, buildSurface, type ComponentSpec, DATA_PATHS } from "./surface";

/** Kinds of question the assistant answers. Each has a predefined layout (static generative UI). */
export const INTENT_CLASSES = [
  "compare_rotations",
  "season_replay",
  "season_snapshot",
  "future_2050",
  "explain_evidence",
  "climate_context",
  "map_layer",
  "confirm_settings",
  "define_term",
  "general",
] as const;

export type IntentClass = (typeof INTENT_CLASSES)[number];

/** Copy keys in `apps/web/src/copy/en.json` for the caption of each fallback layout. */
export const FALLBACK_CAPTION_KEYS: Record<IntentClass, string> = {
  compare_rotations: "assistant.fallback.compareRotations",
  season_replay: "assistant.fallback.seasonReplay",
  season_snapshot: "assistant.fallback.seasonSnapshot",
  future_2050: "assistant.fallback.future2050",
  explain_evidence: "assistant.fallback.explainEvidence",
  climate_context: "assistant.fallback.climateContext",
  map_layer: "assistant.fallback.mapLayer",
  confirm_settings: "assistant.fallback.confirmSettings",
  define_term: "assistant.fallback.defineTerm",
  general: "assistant.fallback.general",
};

export interface FallbackOptions {
  /** Year for `season_snapshot`. */
  year?: number;
  /** Rotation id for `future_2050`. */
  rotation?: string;
  /** Map layer for `map_layer`. */
  layer?: "zones" | "ndvi" | "moisture" | "rain_anomaly" | "heat_days" | "frost_days";
  /** Settings kind for `confirm_settings`. */
  kind?: "priorities" | "constraints";
  /** Follow-up questions shown as chips; tapping one sends it to the assistant. At most 4. */
  chips?: readonly { label: string; question: string }[];
}

const footer: ComponentSpec[] = [
  { id: "src", component: "SourceChips", data: bind(DATA_PATHS.provenance) },
  { id: "trace", component: "TraceDrawer", data: bind(DATA_PATHS.trace) },
];

function body(intent: IntentClass, o: FallbackOptions): ComponentSpec[] {
  switch (intent) {
    case "compare_rotations":
      return [
        { id: "main", component: "RotationCompare", data: bind(DATA_PATHS.rotations) },
        ...footer,
      ];
    case "season_replay":
      return [{ id: "main", component: "ReplayBars", data: bind(DATA_PATHS.backtest) }, ...footer];
    case "season_snapshot":
      return [
        {
          id: "main",
          component: "SeasonSnapshot",
          data: bind(DATA_PATHS.season),
          year: o.year ?? 2012,
        },
        ...footer,
      ];
    case "future_2050":
      return [
        {
          id: "main",
          component: "FutureToggle",
          data: bind(DATA_PATHS.future),
          rotation: o.rotation ?? "current",
        },
        ...footer,
      ];
    case "explain_evidence":
      return [
        { id: "main", component: "EvidenceCard", data: bind(DATA_PATHS.evidence) },
        ...footer,
      ];
    case "climate_context":
      return [{ id: "main", component: "ClimateStrip", data: bind(DATA_PATHS.climate) }, ...footer];
    case "map_layer":
      return [{ id: "main", component: "MapFocus", layer: o.layer ?? "zones" }, ...footer];
    case "confirm_settings":
      return [
        {
          id: "main",
          component: "ConfirmForm",
          data: bind(DATA_PATHS.proposal),
          kind: o.kind ?? "priorities",
        },
      ];
    case "define_term":
    case "general":
      return footer;
  }
}

/**
 * Predefined answer for an intent class, used when the model's surface fails validation twice or
 * no model is available. `caption` is plain text from the copy file (see FALLBACK_CAPTION_KEYS).
 */
export function fallbackSurface(
  intent: IntentClass,
  caption: string,
  options: FallbackOptions = {},
): A2uiMessage[] {
  // A copy: for some intents `body` returns the shared footer list, which must never be changed.
  const parts = [...body(intent, options)];
  const chips = (options.chips ?? []).slice(0, LIMITS.chips);
  if (chips.length > 0) {
    // Chips sit after the data components and before the sources and the trace.
    const at = parts.findIndex((p) => p.id === "src");
    const spec: ComponentSpec = {
      id: "ask",
      component: "ActionChips",
      chips: chips.map((c) => ({
        label: c.label,
        action: { name: "ask", context: { question: c.question } },
      })),
    };
    parts.splice(at < 0 ? parts.length : at, 0, spec);
  }
  return buildSurface([{ id: "cap", component: "Caption", text: caption }, ...parts]);
}
