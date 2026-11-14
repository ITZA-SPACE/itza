import type { UIMessage } from "ai";
import { t } from "../../copy";
import { summaryOf } from "../answerData";
import { useViewStore } from "../viewStore";
import type { TemplateAnswer } from "./build";

type Part = UIMessage["parts"][number];
const part = (value: unknown) => value as Part;
const id = () => crypto.randomUUID();

/**
 * The template answer as a chat message built the way a model answer is: browser tool calls with
 * their results, then `render_answer`. The panel draws it with the same code as any answer, and its
 * data comes from the view store like any answer's.
 */
export function toMessage(answer: TemplateAnswer): UIMessage {
  const parts: Part[] = [part({ type: "text", text: t("assistant.tpl.note") })];
  for (const step of answer.steps) {
    const toolCallId = id();
    useViewStore.getState().record(toolCallId, {
      tool: step.name,
      summary: summaryOf(step.name, step.outcome.summaryParams),
      view: step.outcome.view,
      sources: step.outcome.sources,
    });
    parts.push(
      part({
        type: `tool-${step.name}`,
        toolCallId,
        state: "output-available",
        input: step.input,
        output: step.outcome.output,
      }),
    );
  }
  parts.push(
    part({
      type: "tool-render_answer",
      toolCallId: id(),
      state: "output-available",
      input: { intent: answer.intent, messages: answer.surface },
      output: { status: "ok" },
    }),
  );
  if (answer.extra.length > 0) {
    parts.push(part({ type: "text", text: answer.extra.map((q) => `• ${q}`).join("\n") }));
  }
  return { id: id(), role: "assistant", parts };
}

/** A plain assistant message, for when no answer could be made. */
export function textMessage(text: string): UIMessage {
  return { id: id(), role: "assistant", parts: [part({ type: "text", text })] };
}

export function userMessage(text: string): UIMessage {
  return { id: id(), role: "user", parts: [part({ type: "text", text })] };
}
