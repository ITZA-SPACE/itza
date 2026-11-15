import type { SeasonIndicators } from "@itza/engine/climate";
import { ProvenanceChip, Tooltip } from "@itza/ui-kit";
import { Info } from "lucide-react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipFields, chipLabels } from "../lib/provenance";
import { formatNumber, INDICATORS, typical } from "./indicators";

/**
 * One tile per indicator for the chosen season: the value and the typical season, with its plain
 * explanation in a tooltip. All tiles share one source, shown once under the grid.
 */
export function IndicatorCards({
  season,
  usable,
}: {
  season: SeasonIndicators;
  usable: readonly SeasonIndicators[];
}) {
  const provenance = chipFields(season.provenance);
  return (
    <div className="space-y-3">
      <ul className="grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-3 xl:grid-cols-4">
        {INDICATORS.map((def) => {
          const value = def.value(season);
          const average = typical(usable.map((s) => def.value(s)));
          const unit = t(def.unit);
          return (
            <li key={def.id} className="rounded-panel border border-line-soft bg-glass px-3 py-2.5">
              <h3 className="flex items-center gap-1.5 text-caption font-medium text-ink-muted">
                {t(def.title)}
                <Tooltip content={t(def.explain)}>
                  <button
                    type="button"
                    aria-label={t(def.explain)}
                    className="rounded-full text-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Info aria-hidden className="size-3.5" />
                  </button>
                </Tooltip>
              </h3>
              <p className="font-display text-title font-bold text-ink tabular-nums">
                {value === null
                  ? t("climate.card.none")
                  : `${formatNumber(value, def.digits)} ${unit}`}
              </p>
              {average !== null && def.id !== "soil" ? (
                <p className="text-caption text-subtle">
                  {fmt(t("climate.card.typical"), {
                    value: `${formatNumber(average, def.digits)} ${unit}`,
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ProvenanceChip
        {...provenance}
        ariaLabel={fmt(t("climate.card.provenance"), { indicator: t("climate.title") })}
        labels={chipLabels()}
      />
    </div>
  );
}
