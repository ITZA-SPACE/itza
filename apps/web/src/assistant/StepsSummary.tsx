import { useId, useState } from "react";
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

export function StepsSummary({
  steps,
  seconds,
}: {
  steps: readonly Step[];
  seconds?: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (steps.length === 0) return null;
  return (
    <div className="text-caption text-ink-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 rounded-control px-1 text-left underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {summaryText(steps.length, seconds)}{" "}
        {open ? t("assistant.steps.hide") : t("assistant.steps.show")}
      </button>
      <ul id={id} hidden={!open} className="space-y-1 pb-1">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </ul>
    </div>
  );
}
