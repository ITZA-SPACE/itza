import { t } from "../../copy";
import { HistoryStep } from "../../memory";

/** DEMO_STRATEGY.md §3, 0:15–0:35: the field's history, read from MODIS and HLS. */
export function FieldMemoryStep() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.fieldMemory.note")}</p>
      <HistoryStep />
    </div>
  );
}
