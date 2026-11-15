import {
  type A2uiMessage,
  type FallbackOptions,
  fallbackSurface,
  INTENT_CLASSES,
  type IntentClass,
  validateAnswer,
} from "@itza/ui-kit/catalog";

const LAYERS = ["zones", "ndvi", "moisture", "rain_anomaly", "heat_days", "frost_days"] as const;
const KINDS = ["priorities", "constraints"] as const;

const isIntent = (v: unknown): v is IntentClass =>
  typeof v === "string" && (INTENT_CLASSES as readonly string[]).includes(v);

function optionsOf(input: Record<string, unknown>): FallbackOptions {
  const { year, rotation, layer, kind } = input;
  return {
    ...(typeof year === "number" && Number.isInteger(year) ? { year } : {}),
    ...(typeof rotation === "string" && rotation ? { rotation } : {}),
    ...(typeof layer === "string" && (LAYERS as readonly string[]).includes(layer)
      ? { layer: layer as (typeof LAYERS)[number] }
      : {}),
    ...(typeof kind === "string" && (KINDS as readonly string[]).includes(kind)
      ? { kind: kind as (typeof KINDS)[number] }
      : {}),
  };
}

/**
 * The surface a `render_answer` call asks for, or null when it is not valid. The call is either the
 * model's own A2UI `messages`, or just `{intent, caption}` (plus year, rotation, layer or kind): the
 * layout is then the predefined one for the intent with the model's caption, built here with the
 * same `fallbackSurface` the gateway used to check it.
 */
export function surfaceFromInput(input: Record<string, unknown> | undefined): A2uiMessage[] | null {
  if (!input) return null;
  if (Array.isArray(input.messages)) {
    return validateAnswer(input.messages).ok ? (input.messages as A2uiMessage[]) : null;
  }
  if (!isIntent(input.intent) || typeof input.caption !== "string") return null;
  const built = fallbackSurface(input.intent, input.caption, optionsOf(input));
  return validateAnswer(built).ok ? built : null;
}
