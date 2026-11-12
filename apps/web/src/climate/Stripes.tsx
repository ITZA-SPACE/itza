import type { SeasonIndicators } from "@itza/engine/climate";
import { ClimateStrip } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { formatNumber } from "./indicators";

/**
 * Climate stripes: one stripe per season, warmth in one row and dryness in the other. Orange is
 * warmer or drier, blue cooler or wetter; every stripe also carries its numbers in text.
 */
export function Stripes({ seasons }: { seasons: readonly SeasonIndicators[] }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("climate.stripes.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("climate.stripes.body")}</p>
      </div>
      <div className="space-y-1">
        <h3 className="text-body font-medium text-ink">{t("climate.stripes.warmth")}</h3>
        <ClimateStrip
          label={t("climate.stripes.warmth")}
          items={seasons.map((s) => ({
            id: s.label,
            label: s.label,
            value: s.gdd,
            caption: fmt(t("climate.stripes.warmth.caption"), {
              season: s.label,
              gdd: formatNumber(s.gdd, 0),
            }),
          }))}
        />
      </div>
      <div className="space-y-1">
        <h3 className="text-body font-medium text-ink">{t("climate.stripes.dryness")}</h3>
        <ClimateStrip
          label={t("climate.stripes.dryness")}
          items={seasons.map((s) => ({
            id: s.label,
            label: s.label,
            // Negated so that a drier season is orange, like a warmer one.
            value: -s.rainMinusEt0Mm,
            caption: fmt(t("climate.stripes.dryness.caption"), {
              season: s.label,
              balance: formatNumber(s.rainMinusEt0Mm, 0),
            }),
          }))}
        />
      </div>
    </section>
  );
}
