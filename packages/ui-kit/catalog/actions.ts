import { Validator } from "@cfworker/json-schema";
import type { JsonSchema } from "./schemas";

/**
 * Actions a chip may trigger. Each name maps to one browser tool or one navigation. Anything not
 * listed is dropped. State changes are not here: they only happen through ConfirmForm.
 */
export type ResolvedAction =
  | { kind: "tool"; tool: string; args: Record<string, unknown> }
  | { kind: "navigate"; view: string; params: Record<string, unknown> }
  /** A follow-up question the user can send to the assistant with one tap. */
  | { kind: "ask"; question: string };

interface ActionRule {
  kind: "tool" | "navigate" | "ask";
  /** Tool name, or the view for navigation. */
  target: string;
  context: JsonSchema;
}

const str = { type: "string", minLength: 1, maxLength: 64 };
const none: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

export const ACTION_ALLOWLIST: Record<string, ActionRule> = {
  compare_rotations: { kind: "tool", target: "compare_rotations", context: none },
  run_backtest: {
    kind: "tool",
    target: "run_backtest",
    context: {
      type: "object",
      properties: { rotation: str, scenario: { enum: ["history", "2050"] } },
      required: ["rotation"],
      additionalProperties: false,
    },
  },
  get_season: {
    kind: "tool",
    target: "get_season",
    context: {
      type: "object",
      properties: { year: { type: "integer", minimum: 1980, maximum: 2100 } },
      required: ["year"],
      additionalProperties: false,
    },
  },
  explain_exclusion: {
    kind: "tool",
    target: "explain_exclusion",
    context: {
      type: "object",
      properties: { crop: str },
      required: ["crop"],
      additionalProperties: false,
    },
  },
  // A follow-up question the model suggests. Tapping it sends the text as the user's next message,
  // exactly as if they had typed it; it changes nothing by itself.
  ask: {
    kind: "ask",
    target: "ask",
    context: {
      type: "object",
      properties: { question: { type: "string", minLength: 3, maxLength: 120 } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  open_future: { kind: "navigate", target: "future", context: none },
  open_twin: { kind: "navigate", target: "twin", context: none },
  open_zones: { kind: "navigate", target: "zones", context: none },
  open_replay: { kind: "navigate", target: "replay", context: none },
};

const validators = new Map<string, Validator>();

/** Maps a chip action to a browser tool or navigation, or null when the name or context is not allowed. */
export function resolveAction(action: {
  name: string;
  context?: Record<string, unknown>;
}): ResolvedAction | null {
  if (!Object.hasOwn(ACTION_ALLOWLIST, action.name)) return null;
  const rule = ACTION_ALLOWLIST[action.name];
  if (!rule) return null;
  let validator = validators.get(action.name);
  if (!validator) {
    validator = new Validator(rule.context, "2020-12");
    validators.set(action.name, validator);
  }
  const context = action.context ?? {};
  if (!validator.validate(context).valid) return null;
  if (rule.kind === "ask") return { kind: "ask", question: String(context.question).trim() };
  return rule.kind === "tool"
    ? { kind: "tool", tool: rule.target, args: context }
    : { kind: "navigate", view: rule.target, params: context };
}
