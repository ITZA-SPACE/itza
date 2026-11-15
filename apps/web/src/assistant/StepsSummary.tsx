import { Disclosure } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import type { Step } from "./steps";
import { StepRow } from "./Thinking";

/** "Worked for 6 s in 3 steps": what the assistant did, folded away once the answer is shown. */
export function summaryText(count: number, seconds: number | undefined): string {
  const one = count === 1;
  if (seconds === undefined) {
    return fmt(t(one ? "assistant.steps.summary.one" : "assistant.steps.summary"), { count });
  }
  return fmt(t(one ? "assistant.steps.summary.time.one" : "assistant.steps.summary.time"), {
    seconds,
    count,
  });
}

/** The design system's Disclosure: a glass row, closed by default, with the step count as a pill. */
export function StepsSummary({
  steps,
  seconds,
}: {
  steps: readonly Step[];
  seconds?: number | undefined;
}) {
  if (steps.length === 0) return null;
  return (
    <Disclosure summary={summaryText(steps.length, seconds)} count={steps.length}>
      <ul className="space-y-1.5 pt-1">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </ul>
    </Disclosure>
  );
}
