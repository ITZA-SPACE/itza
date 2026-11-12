import { Button } from "@itza/ui-kit";
import { useEffect } from "react";
import { type CopyKey, t } from "../copy";
import { DEMO_STEP_IDS } from "./constants";
import { ArenaZonesStep } from "./steps/Arena";
import { AssistantStep } from "./steps/Assistant";
import { ClimateFingerprintStep } from "./steps/Climate";
import { CloseStep } from "./steps/Close";
import { FieldMemoryStep } from "./steps/FieldMemory";
import { Future2050Step } from "./steps/Future";
import { ReplayStep } from "./steps/Replay";
import { SlidersStep } from "./steps/Sliders";
import { TitleStep } from "./steps/Title";
import { ValidationStep } from "./steps/Validation";
import { useDemo } from "./useDemo";

const STEP_COMPONENTS = {
  title: TitleStep,
  fieldMemory: FieldMemoryStep,
  climate: ClimateFingerprintStep,
  replay: ReplayStep,
  assistant: AssistantStep,
  sliders: SlidersStep,
  future: Future2050Step,
  validation: ValidationStep,
  arena: ArenaZonesStep,
  close: CloseStep,
} as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The guided demo (C-3): a resettable, keyboard-advanced walkthrough of the story hero field,
 * following DEMO_STRATEGY.md §3. Every step applies fixed inputs before it is shown, so the run is
 * deterministic; everything comes from the precomputed hero bundle and offline assistant templates,
 * so it works with no network at all.
 */
export function DemoPage() {
  const index = useDemo((s) => s.index);
  const next = useDemo((s) => s.next);
  const prev = useDemo((s) => s.prev);
  const goto = useDemo((s) => s.goto);
  const reset = useDemo((s) => s.reset);

  useEffect(() => {
    // Applies the first step's fixed state on mount, the same way `next`/`prev`/`goto` do for the rest.
    goto(0);
    // `goto` is a stable zustand action, so this only runs once on mount.
  }, [goto]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev]);

  const stepId = DEMO_STEP_IDS[index] ?? "title";
  const Step = STEP_COMPONENTS[stepId];
  const titleKey = `demo.step.${stepId}.title` as CopyKey;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft bg-surface px-3 py-2">
        <p role="status" aria-live="polite" className="text-body font-semibold text-ink">
          {t("demo.step.counter")
            .replace("{current}", String(index + 1))
            .replace("{total}", String(DEMO_STEP_IDS.length))}
          {": "}
          {t(titleKey)}
        </p>
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="secondary" onClick={prev} disabled={index === 0}>
            {t("demo.nav.back")}
          </Button>
          <Button onClick={next} disabled={index === DEMO_STEP_IDS.length - 1}>
            {t("demo.nav.next")}
          </Button>
          <Button variant="ghost" onClick={reset}>
            {t("demo.nav.reset")}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Step />
      </div>
      <p className="sr-only" aria-live="polite">
        {t("demo.nav.hint")}
      </p>
    </div>
  );
}
