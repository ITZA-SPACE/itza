import { demoQuestion } from "../constants";
import { ScriptedAnswer } from "../ScriptedAnswer";

/** DEMO_STRATEGY.md §3, 1:20–1:40: a typed question and the generative-UI answer it assembles. */
export function AssistantStep() {
  const question = demoQuestion();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="ml-auto w-fit max-w-[85%] rounded-[1.25rem] rounded-br-md border border-rain/50 bg-space/20 px-4 py-2.5 text-body text-ink">
        {question}
      </p>
      <ScriptedAnswer question={question} />
    </div>
  );
}
