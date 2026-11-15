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

const asText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;

/** Up to four {label, question} pairs the model suggested; anything malformed is skipped. */
function chipsOf(value: unknown): { label: string; question: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { label: string; question: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const label = asText((item as Record<string, unknown>).label, 40);
    const question = asText((item as Record<string, unknown>).question, 120);
    if (label && question && question.length >= 3) out.push({ label, question });
  }
  return out.slice(0, 4);
}

function optionsOf(input: Record<string, unknown>): FallbackOptions {
  const { year, rotation, layer, kind } = input;
  const chips = chipsOf(input.chips);
  return {
    ...(chips.length > 0 ? { chips } : {}),
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

const SOURCE_COMPONENTS = new Set(["SourceChips", "TraceDrawer"]);

interface ComponentLike {
  id: string;
  component: string;
  children?: string[];
}

/**
 * The surface without the sources row and the trace drawer. Answers no longer show them, and a
 * model that writes its own surface may still include them; the layout stays valid without them.
 */
export function withoutSources(messages: A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const update = (message as unknown as { updateComponents?: { components: ComponentLike[] } })
      .updateComponents;
    if (!update) return message;
    const dropped = new Set(
      update.components.filter((c) => SOURCE_COMPONENTS.has(c.component)).map((c) => c.id),
    );
    if (dropped.size === 0) return message;
    const components = update.components
      .filter((c) => !dropped.has(c.id))
      .map((c) =>
        Array.isArray(c.children)
          ? { ...c, children: c.children.filter((id) => !dropped.has(id)) }
          : c,
      );
    return { ...message, updateComponents: { ...update, components } } as unknown as A2uiMessage;
  });
}
