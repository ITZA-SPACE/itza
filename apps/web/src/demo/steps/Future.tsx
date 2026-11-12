import { t } from "../../copy";
import { FutureStep } from "../../future/FutureStep";

/** DEMO_STRATEGY.md §3, 1:55–2:15: the same rotations replayed under NASA climate projections. */
export function Future2050Step() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.future.note")}</p>
      <FutureStep />
    </div>
  );
}
