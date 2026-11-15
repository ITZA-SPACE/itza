import { detectLanguage } from "@itza/ui-kit/catalog";
import type { UIMessage } from "ai";
import { NoFieldError } from "../bridge";
import { localeOf, tl } from "../locale";
import type { ToolDeps } from "../tools";
import { runTemplate } from "./build";
import { textMessage, toMessage } from "./message";

export { runTemplate } from "./build";
export { exampleQuestion, matchIntent, TEMPLATE_INTENTS } from "./intents";
export { textMessage, toMessage, userMessage } from "./message";

/** Answers a question from templates; a failure becomes a plain message instead of a thrown error. */
export async function answerOffline(question: string, deps: ToolDeps): Promise<UIMessage> {
  const locale = localeOf(detectLanguage(question));
  try {
    return toMessage(await runTemplate(question, deps));
  } catch (error) {
    if (error instanceof NoFieldError) return textMessage(tl(locale, "assistant.error.noField"));
    const message = error instanceof Error ? error.message : "";
    return textMessage(
      message
        ? tl(locale, "assistant.error.tool").replace("{message}", message)
        : tl(locale, "assistant.error.generic"),
    );
  }
}
