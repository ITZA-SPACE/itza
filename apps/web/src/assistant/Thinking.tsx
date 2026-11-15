import { cn } from "@itza/ui-kit";
import { useEffect, useState } from "react";
import { type CopyKey, t } from "../copy";
import type { Step } from "./steps";

/** After this long the indicator adds a line saying that satellite data can be slow. */
const SLOW_AFTER_MS = 8_000;

/** A check for a finished step and a cross for a failed one; both are drawn, not font glyphs. */
export function StepMark({ state }: { state: Step["state"] }) {
  if (state === "running") {
    return <span className="size-2 rounded-full bg-rain shadow-glow motion-safe:animate-pulse" />;
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      {state === "done" ? <path d="M2 6.5l2.5 2.5L10 3.5" /> : <path d="M3 3l6 6M9 3l-6 6" />}
    </svg>
  );
}

/** One finished line: what the tool found, with a count when the same tool ran more than once. */
export function StepRow({ step }: { step: Step }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-caption transition duration-300 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none",
        step.state === "error" ? "text-risk-ink" : "text-ink-muted",
      )}
    >
      <span className={cn("mt-1 flex w-3 justify-center", step.state === "done" && "text-leaf")}>
        <StepMark state={step.state} />
      </span>
      <span dir="auto">
        {step.detail ?? t(step.key)}
        {step.count > 1 ? ` ×${step.count}` : ""}
      </span>
    </li>
  );
}

/**
 * The waiting indicator: a small globe with a satellite orbiting it, the step being worked on, and
 * the steps already finished as a short checklist. It is only decoration for the eye (the live
 * region in the panel announces each step once), and with reduced motion everything stands still.
 */
export function Thinking({ step, steps = [] }: { step: CopyKey; steps?: readonly Step[] }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const finished = steps.filter((s) => s.state !== "running");
  return (
    <div
      aria-hidden="true"
      data-testid="thinking"
      className="space-y-2 transition duration-300 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      <div className="flex items-center gap-3">
        <span className="relative inline-block size-7 shrink-0">
          <span className="absolute inset-1 rounded-full bg-aurora shadow-glow" />
          <span className="absolute inset-0 motion-safe:animate-spin motion-safe:[animation-duration:2.4s]">
            <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-rain shadow-glow" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-body text-ink">
            <span>{t(step)}</span>
            <span className="inline-flex gap-0.5" data-testid="dots">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  style={{ animationDelay: `${delay}ms` }}
                  className="size-1 rounded-full bg-rain motion-safe:animate-bounce"
                />
              ))}
            </span>
          </span>
          {slow ? (
            <span className="block text-caption text-ink-muted">{t("assistant.step.slow")}</span>
          ) : null}
        </span>
      </div>
      {finished.length > 0 ? (
        <ul className="space-y-1 pl-10" data-testid="finished-steps">
          {finished.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
