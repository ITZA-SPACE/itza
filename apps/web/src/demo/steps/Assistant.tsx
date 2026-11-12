import { t } from "../../copy";
import { demoQuestion } from "../constants";
import { ScriptedAnswer } from "../ScriptedAnswer";

/** DEMO_STRATEGY.md §3, 1:20–1:40: a typed question and the generative-UI answer it assembles. */
export function AssistantStep() {
  const question = demoQuestion();
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.assistant.note")}</p>
      <p className="rounded-control bg-surface-muted p-3 text-body font-medium text-ink">
        {question}
      </p>
      <ScriptedAnswer question={question} />
    </div>
  );
}
