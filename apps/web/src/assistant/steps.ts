import type { UIMessage } from "ai";
import type { CopyKey } from "../copy";
import { toolPartInfo } from "./parts";
import { stepOfTool } from "./phase";
import type { ToolEntry } from "./viewStore";

/** One line of the thinking checklist: a tool call of the turn, running, done or failed. */
export interface Step {
  id: string;
  key: CopyKey;
  state: "running" | "done" | "error";
  /** What the tool found, in words (the trace summary); absent while it runs. */
  detail?: string;
  /** More than one call of the same tool were merged into this line. */
  count: number;
}

export const MAX_STEPS = 6;

/**
 * The checklist for an assistant message, from its tool parts. Repeated calls to one tool are one
 * line with a count; the answer itself is a step only while it is being drawn.
 */
export function stepsOf(message: UIMessage, byCall: Record<string, ToolEntry>): Step[] {
  const steps: Step[] = [];
  for (const part of message.parts) {
    const info = toolPartInfo(part);
    if (!info) continue;
    const done = info.state === "output-available";
    if (info.name === "render_answer" && done) continue;
    const state: Step["state"] =
      info.state === "output-error" ? "error" : done ? "done" : "running";
    const key = stepOfTool(info.name);
    const detail = done ? byCall[info.toolCallId]?.summary : undefined;
    const same = steps.find((s) => s.key === key && s.state !== "running" && state !== "running");
    if (same) {
      same.count += 1;
      if (state === "error") same.state = "error";
      continue;
    }
    steps.push({ id: info.toolCallId, key, state, count: 1, ...(detail ? { detail } : {}) });
  }
  return steps.slice(-MAX_STEPS);
}
