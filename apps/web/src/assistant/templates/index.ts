import type { UIMessage } from "ai";
import { t } from "../../copy";
import { NoFieldError } from "../bridge";
import type { ToolDeps } from "../tools";
import { runTemplate } from "./build";
import { textMessage, toMessage } from "./message";

export { runTemplate } from "./build";
export { exampleQuestion, matchIntent, TEMPLATE_INTENTS } from "./intents";
export { textMessage, toMessage, userMessage } from "./message";

/** Answers a question from templates; a failure becomes a plain message instead of a thrown error. */
export async function answerOffline(question: string, deps: ToolDeps): Promise<UIMessage> {
  try {
    return toMessage(await runTemplate(question, deps));
  } catch (error) {
    if (error instanceof NoFieldError) return textMessage(t("assistant.error.noField"));
    const message = error instanceof Error ? error.message : "";
    return textMessage(
      message
        ? t("assistant.error.tool").replace("{message}", message)
        : t("assistant.error.generic"),
    );
  }
}
