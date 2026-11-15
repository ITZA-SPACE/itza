import wordmark from "../../assets/itza-wordmark.svg";
import { t } from "../../copy";
import { AppDisclaimerList } from "../../disclaimers";

/** DEMO_STRATEGY.md §3, 2:45–3:00: the disclaimers and the closing line. */
export function CloseStep() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-8 text-center">
      <img
        src={wordmark}
        alt={t("demo.title.name")}
        width={188}
        height={54}
        className="h-[54px] w-[188px]"
      />
      <p className="font-display text-display font-bold text-ink">{t("demo.close.line")}</p>
      <div className="glass-panel w-full rounded-card p-5 text-left">
        <AppDisclaimerList />
      </div>
    </div>
  );
}
