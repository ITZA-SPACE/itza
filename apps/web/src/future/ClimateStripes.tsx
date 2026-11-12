import type { FutureResult } from "@itza/engine/worker";
import { ClimateStrip } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { sspLabel } from "./labels";

/**
 * Future climate stripes: one stripe per replayed season, colored by its mean temperature on one
 * scale shared by every row, so Today and each scenario can be read against each other.
 */
export function ClimateStripes({
  climate,
  year,
}: {
  climate: FutureResult["climate"];
  year: number;
}) {
  const id = useId();
  const temperatures = climate.flatMap((row) => row.seasons.map((s) => s.meanTempC));
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("future.stripes.title")}
        </h3>
        <p className="text-body text-ink-muted">{t("future.stripes.body")}</p>
      </div>
      {climate.map((row) => {
        const name =
          row.id === "today"
            ? t("future.stripes.today")
            : fmt(t("future.stripes.row"), { scenario: sspLabel(row.id), year });
        return (
          <div key={row.id} className="space-y-1">
            <h4 className="text-body font-medium text-ink">{name}</h4>
            <ClimateStrip
              label={`${name}: ${t("future.stripes.label")}`}
              min={min}
              max={max}
              items={row.seasons.map((s) => ({
                id: s.label,
                label: s.label,
                value: s.meanTempC,
                caption: fmt(t("future.stripes.caption"), {
                  row: name,
                  season: s.label,
                  temp: s.meanTempC.toFixed(1),
                  rain: Math.round(s.rainMm),
                }),
              }))}
            />
          </div>
        );
      })}
    </section>
  );
}
