import { CompareStep } from "../../compare/CompareStep";
import { t } from "../../copy";

/** DEMO_STRATEGY.md §3, 1:40–1:55: rainfall −20%, the ranking shifts, the robust rotation stands out. */
export function SlidersStep() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.sliders.note")}</p>
      <CompareStep />
    </div>
  );
}
