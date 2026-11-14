import { t } from "../../copy";
import { AppDisclaimerList } from "../../disclaimers";

/** DEMO_STRATEGY.md §3, 2:45–3:00: the printable card (ShareBar, on the Replay step), disclaimer, close. */
export function CloseStep() {
  return (
    <div className="space-y-4 p-3 text-center">
      <p className="text-title font-semibold text-ink">{t("demo.step.close.note")}</p>
      <AppDisclaimerList className="mx-auto max-w-prose text-left" />
      <p className="font-display text-display font-bold tracking-widest text-ink">
        {t("demo.title.name")}
      </p>
      <p className="text-title text-ink-muted">{t("demo.close.line")}</p>
    </div>
  );
}
