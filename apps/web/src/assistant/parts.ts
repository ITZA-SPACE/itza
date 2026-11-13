import type { UIMessage } from "ai";

export interface ToolPartInfo {
  name: string;
  toolCallId: string;
  state: string;
  input: unknown;
  output: unknown;
}

type AnyPart = UIMessage["parts"][number];

/** A tool call part as plain fields, whether the SDK typed it as a static or a dynamic tool. */
export function toolPartInfo(part: AnyPart): ToolPartInfo | null {
  const p = part as unknown as Record<string, unknown>;
  const type = p.type;
  let name: string | null = null;
  if (type === "dynamic-tool" && typeof p.toolName === "string") name = p.toolName;
  else if (typeof type === "string" && type.startsWith("tool-")) name = type.slice(5);
  if (!name || typeof p.toolCallId !== "string") return null;
  return {
    name,
    toolCallId: p.toolCallId,
    state: typeof p.state === "string" ? p.state : "",
    input: p.input,
    output: p.output,
  };
}

/** Index of the last user message before `index`, or -1. */
export function turnStart(messages: readonly UIMessage[], index: number): number {
  for (let i = index; i >= 0; i--) if (messages[i]?.role === "user") return i;
  return -1;
}

/** Tool calls of the turn that message `index` belongs to, up to and including that message. */
export function turnToolParts(messages: readonly UIMessage[], index: number): ToolPartInfo[] {
  const found: ToolPartInfo[] = [];
  for (const message of messages.slice(turnStart(messages, index) + 1, index + 1)) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      const info = toolPartInfo(part);
      if (info) found.push(info);
    }
  }
  return found;
}

/** The question the answer in message `index` replies to: the text of the turn's user message. */
export function questionOf(messages: readonly UIMessage[], index: number): string {
  const user = messages[turnStart(messages, index)];
  const text = user?.parts.find((p) => p.type === "text");
  return text && "text" in text ? text.text : "";
}
