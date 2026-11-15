import type { UIMessage } from "ai";
import type { CopyKey } from "../copy";
import { toolPartInfo } from "./parts";

/** What the assistant is doing right now, for the waiting indicator and the screen reader. */
export interface Phase {
  key: CopyKey;
}

const TOOL_STEPS: Record<string, CopyKey> = {
  get_field_summary: "assistant.step.field",
  compare_rotations: "assistant.step.compare",
  run_backtest: "assistant.step.replay",
  get_season: "assistant.step.season",
  explain_exclusion: "assistant.step.exclusion",
  define_term: "assistant.step.term",
  set_priorities: "assistant.step.settings",
  set_constraints: "assistant.step.settings",
  navigate: "assistant.step.navigate",
  render_answer: "assistant.step.answer",
};

/** The step a tool belongs to: the NASA servers are named by prefix, anything else is generic. */
export function stepOfTool(name: string): CopyKey {
  if (name in TOOL_STEPS) return TOOL_STEPS[name] as CopyKey;
  if (name.startsWith("power_")) return "assistant.step.power";
  if (name.startsWith("cmr_")) return "assistant.step.cmr";
  return "assistant.step.work";
}

/**
 * The current phase, or null when nothing is pending. Before the first reply part it is "thinking";
 * a tool that has not returned names itself; a reply that is only text shows nothing, because the
 * text itself is the progress.
 */
export function phaseOf(
  status: string,
  messages: readonly UIMessage[],
  working: boolean,
): Phase | null {
  if (working) return { key: "assistant.step.field" };
  if (status === "submitted") return { key: "assistant.status.thinking" };
  if (status !== "streaming") return null;
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return { key: "assistant.status.thinking" };
  const pending = last.parts
    .map((part) => toolPartInfo(part))
    .filter((info) => info !== null && info.state !== "output-available");
  const tool = pending[pending.length - 1];
  if (tool) return { key: stepOfTool(tool.name) };
  const visible = last.parts.some(
    (part) => (part.type === "text" && part.text.trim() !== "") || toolPartInfo(part) !== null,
  );
  return visible ? null : { key: "assistant.status.thinking" };
}
