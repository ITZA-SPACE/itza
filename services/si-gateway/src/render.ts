import {
  LIMITS as CATALOG_LIMITS,
  checkGrounding,
  type FallbackOptions,
  fallbackSurface,
  INTENT_CLASSES,
  validateAnswer,
} from "@itza/ui-kit/catalog";
import { tool } from "ai";
import { z } from "zod";

interface ToolPart {
  type?: unknown;
  toolName?: unknown;
  state?: unknown;
  output?: unknown;
}
interface TurnMessage {
  role: string;
  parts: ToolPart[];
}

const RENDER_TOOL = "render_answer";

function toolName(part: ToolPart): string | null {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") return part.toolName;
  return typeof part.type === "string" && part.type.startsWith("tool-") ? part.type.slice(5) : null;
}

/** Finished tool parts since the last user message: the turn the answer must be grounded in. */
function turnParts(messages: readonly TurnMessage[]): { name: string; output: unknown }[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  const found: { name: string; output: unknown }[] = [];
  for (const message of messages.slice(lastUser + 1)) {
    for (const part of message.parts) {
      const name = toolName(part);
      if (name && part.state === "output-available") found.push({ name, output: part.output });
    }
  }
  return found;
}

/** Data from tool outputs of this turn (render_answer itself excluded), unwrapped from provenance. */
export function collectTurnOutputs(messages: readonly TurnMessage[]): unknown[] {
  return turnParts(messages)
    .filter((p) => p.name !== RENDER_TOOL)
    .map(({ output }) =>
      output && typeof output === "object" && "untrusted_data" in output
        ? (output as { untrusted_data: unknown }).untrusted_data
        : output,
    );
}

/** How many render_answer attempts already failed in this turn (they may span requests). */
export function countFailedRenders(messages: readonly TurnMessage[]): number {
  return turnParts(messages).filter(({ name, output }) => {
    const status = (output as { status?: unknown } | null)?.status;
    return name === RENDER_TOOL && (status === "error" || status === "fallback");
  }).length;
}

function numericLeaves(value: unknown, out: string[]): void {
  if (typeof value === "number") out.push(String(value));
  else if (Array.isArray(value)) for (const item of value) numericLeaves(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) numericLeaves(item, out);
}

const LAYERS = ["zones", "ndvi", "moisture", "rain_anomaly", "heat_days", "frost_days"] as const;

/**
 * `render_answer`: shows the answer as a catalog surface and grounds its numbers.
 *
 * Preferred call: `{intent, caption}` (plus `year`, `rotation`, `layer` or `kind` when the layout
 * needs it). The model writes only the sentence; the predefined layout for the intent is built here
 * and in the browser from the same `fallbackSurface`, so it is always valid. Advanced call: the
 * model's own A2UI `messages`. Either way the first failure goes back to the model for one
 * self-correction; the second tells the client to show the predefined layout. `toolOutputs` is read
 * at call time, so server tool results of the same request count.
 */
export function createRenderAnswerTool(toolOutputs: readonly unknown[], priorFailures: number) {
  let failures = priorFailures;
  return tool({
    description:
      'Show the answer as an interactive surface. Call it once, at the end, with {"intent", "caption"}: the intent picks the layout and the caption is one or two plain sentences in the user\'s language. Add year (season_snapshot), rotation (future_2050), layer (map_layer) or kind (confirm_settings) when the intent needs it. Advanced: pass A2UI "messages" built only from catalog components instead.',
    inputSchema: z
      .object({
        intent: z.enum(INTENT_CLASSES).optional(),
        caption: z.string().min(1).max(CATALOG_LIMITS.textLength).optional(),
        year: z.number().int().min(1980).max(2100).optional(),
        rotation: z.string().min(1).max(64).optional(),
        layer: z.enum(LAYERS).optional(),
        kind: z.enum(["priorities", "constraints"]).optional(),
        messages: z.array(z.unknown()).min(1).max(CATALOG_LIMITS.messages).optional(),
      })
      .refine(
        (v) => v.messages !== undefined || (v.intent !== undefined && v.caption !== undefined),
        {
          message: "Give intent and caption, or messages.",
        },
      ),
    execute: async ({ messages, intent, caption, year, rotation, layer, kind }) => {
      const options: FallbackOptions = {
        ...(year !== undefined ? { year } : {}),
        ...(rotation !== undefined ? { rotation } : {}),
        ...(layer !== undefined ? { layer } : {}),
        ...(kind !== undefined ? { kind } : {}),
      };
      const built =
        messages ??
        (intent && caption !== undefined ? fallbackSurface(intent, caption, options) : []);
      const result = validateAnswer(built);
      let failure: { code: string; errors: string[] } | null = null;
      if (!result.ok) {
        failure = { code: "VALIDATION_FAILED", errors: result.errors };
      } else {
        const values: string[] = [];
        numericLeaves(result.surface.dataValues, values);
        const grounding = checkGrounding([...result.surface.captions, ...values], toolOutputs);
        if (!grounding.ok) {
          failure = {
            code: "GROUNDING_FAILED",
            errors: [
              `These numbers are not in any tool result: ${grounding.unsupported.join(", ")}.`,
            ],
          };
        }
      }
      if (!failure)
        return {
          status: "ok" as const,
          droppedActions: result.ok ? result.surface.droppedActions : 0,
        };
      failures += 1;
      if (failures > 1) return { status: "fallback" as const, code: failure.code, intent };
      return {
        status: "error" as const,
        ...failure,
        hint: 'Fix these problems and call render_answer once more. The simplest valid call is {"intent": "<one of the intents>", "caption": "<plain sentence using only numbers from tool results>"}. If it fails again, a default layout is shown.',
      };
    },
  });
}
