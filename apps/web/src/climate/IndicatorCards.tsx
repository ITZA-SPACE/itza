import type { SeasonIndicators } from "@itza/engine/climate";
import { Card, ProvenanceChip } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipFields, chipLabels } from "../lib/provenance";
import { formatNumber, INDICATORS, typical } from "./indicators";

/** One card per indicator for the chosen season: the value, the typical season, a sentence, the source. */
export function IndicatorCards({
  season,
  usable,
}: {
  season: SeasonIndicators;
  usable: readonly SeasonIndicators[];
}) {
  const provenance = chipFields(season.provenance);
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {INDICATORS.map((def) => {
        const value = def.value(season);
        const average = typical(usable.map((s) => def.value(s)));
        const unit = t(def.unit);
        return (
          <li key={def.id}>
            <Card className="h-full space-y-2">
              <h3 className="text-body font-semibold text-ink">{t(def.title)}</h3>
              <p className="text-title font-semibold text-ink">
                {value === null
                  ? t("climate.card.none")
                  : `${formatNumber(value, def.digits)} ${unit}`}
              </p>
              {average !== null && def.id !== "soil" ? (
                <p className="text-caption text-ink-muted">
                  {fmt(t("climate.card.typical"), {
                    value: `${formatNumber(average, def.digits)} ${unit}`,
                  })}
                </p>
              ) : null}
              <p className="text-body text-ink-muted">{t(def.explain)}</p>
              <ProvenanceChip
                {...provenance}
                ariaLabel={fmt(t("climate.card.provenance"), { indicator: t(def.title) })}
                labels={chipLabels()}
              />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
