import { Button, cn, focusRing, IconButton } from "@itza/ui-kit";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { type CopyKey, hasCopy, t } from "../copy";
import { fmt } from "../lib/format";
import { DEMO_STEP_IDS, DEMO_STEP_SECONDS } from "./constants";
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
  const playing = useDemo((s) => s.playing);
  const togglePlaying = useDemo((s) => s.togglePlaying);

  useEffect(() => {
    // Applies the first step's fixed state on mount, the same way `next`/`prev`/`goto` do for the rest.
    goto(0);
    // `goto` is a stable zustand action, so this only runs once on mount.
  }, [goto]);

  // Play mode: each step stays for its time slot, then the script moves on by itself.
  useEffect(() => {
    if (!playing) return;
    const seconds = DEMO_STEP_SECONDS[DEMO_STEP_IDS[index] ?? "title"];
    const timer = setTimeout(next, seconds * 1000);
    return () => clearTimeout(timer);
  }, [playing, index, next]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        togglePlaying();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev, togglePlaying]);

  const stepId = DEMO_STEP_IDS[index] ?? "title";
  const Step = STEP_COMPONENTS[stepId];
  const noteKey = `demo.step.${stepId}.note`;
  const last = DEMO_STEP_IDS.length - 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-4">
      <header className="space-y-4">
        <ol className="flex gap-1.5" aria-label={t("demo.progress")}>
          {DEMO_STEP_IDS.map((id, i) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => goto(i)}
                aria-current={i === index ? "step" : undefined}
                aria-label={`${fmt(t("demo.step.counter"), { current: i + 1, total: DEMO_STEP_IDS.length })}: ${t(`demo.step.${id}.title` as CopyKey)}`}
                className={cn(
                  "block h-1.5 w-full rounded-full transition-colors",
                  i < index ? "bg-rain/70" : i === index ? "bg-aurora" : "bg-glass-strong",
                  focusRing,
                )}
              />
            </li>
          ))}
        </ol>
        <div className="space-y-1">
          <p className="text-[0.75rem] leading-4 font-bold tracking-[0.06em] text-accent uppercase">
            {fmt(t("demo.step.counter"), { current: index + 1, total: DEMO_STEP_IDS.length })}
            {" · "}
            {fmt(t("demo.step.seconds"), { seconds: DEMO_STEP_SECONDS[stepId] })}
          </p>
          <h1
            role="status"
            aria-live="polite"
            className="text-[1.875rem] leading-9 font-bold text-ink sm:text-display"
          >
            {t(`demo.step.${stepId}.title` as CopyKey)}
          </h1>
          {hasCopy(noteKey) ? (
            <p className="max-w-3xl text-[0.9375rem] leading-[1.375rem] text-ink-muted">
              {t(noteKey)}
            </p>
          ) : null}
        </div>
      </header>
      <section aria-label={t(`demo.step.${stepId}.title` as CopyKey)} className="py-6">
        <Step />
      </section>
      <nav
        aria-label={t("demo.controls")}
        className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-10 mx-auto flex w-fit items-center gap-2 rounded-full glass-panel bg-surface/90 p-1.5 shadow-float lg:bottom-4"
      >
        <IconButton label={t("demo.nav.reset")} onClick={reset}>
          <RotateCcw aria-hidden />
        </IconButton>
        <IconButton label={t("demo.nav.back")} onClick={prev} disabled={index === 0}>
          <ChevronLeft aria-hidden />
        </IconButton>
        <IconButton
          label={playing ? t("demo.nav.pause") : t("demo.nav.play")}
          aria-pressed={playing}
          onClick={togglePlaying}
          disabled={index === last && !playing}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </IconButton>
        <Button onClick={next} disabled={index === last}>
          {t("demo.nav.next")}
          <ChevronRight aria-hidden />
        </Button>
      </nav>
      <p className="sr-only">{t("demo.nav.hint")}</p>
    </div>
  );
}
