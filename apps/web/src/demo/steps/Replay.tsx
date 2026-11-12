import { CompareStep } from "../../compare/CompareStep";
import { t } from "../../copy";

/** DEMO_STRATEGY.md §3, 0:50–1:20: Season Replay of three rotations and an evidence card. */
export function ReplayStep() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.replay.note")}</p>
      <CompareStep />
    </div>
  );
}
