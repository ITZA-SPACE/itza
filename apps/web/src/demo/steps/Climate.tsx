import { ClimateStep } from "../../climate";
import { t } from "../../copy";

/** DEMO_STRATEGY.md §3, 0:35–0:50: the worst season, auto-flagged from the data. */
export function ClimateFingerprintStep() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.climate.note")}</p>
      <ClimateStep />
    </div>
  );
}
