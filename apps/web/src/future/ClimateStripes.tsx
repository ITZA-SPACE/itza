import type { FutureResult } from "@itza/engine/worker";
import { Card, ClimateStrip } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { sspDetail } from "./labels";

/** The same seven bins ClimateStrip colours with, cool to hot; shown as a discrete legend. */
const LEGEND = [
  "bg-div-neg-3",
  "bg-div-neg-2",
  "bg-div-neg-1",
  "bg-div-mid",
  "bg-div-pos-1",
  "bg-div-pos-2",
  "bg-div-pos-3",
] as const;

/**
 * Future climate stripes: one stripe per replayed season, coloured by its mean temperature on one
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
    <Card aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-0.5">
        <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
          {t("future.stripes.title")}
        </h3>
        <p className="text-caption text-ink-muted">{t("future.stripes.body")}</p>
      </div>
      {climate.map((row) => {
        const name =
          row.id === "today"
            ? t("future.stripes.today")
            : fmt(t("future.stripes.row"), { scenario: sspDetail(row.id) ?? row.id, year });
        return (
          <div key={row.id} className="grid grid-cols-[7rem_1fr] items-center gap-3">
            <h4 className="text-caption text-ink-muted">{name}</h4>
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
      <div className="flex items-center gap-1.5 text-caption text-ink-muted" aria-hidden="true">
        <span className="mr-1">
          {t("future.stripes.cooler")} {min.toFixed(1)} °C
        </span>
        {LEGEND.map((bin) => (
          <span key={bin} className={`inline-block h-3 w-6 rounded-sm ${bin}`} />
        ))}
        <span className="ml-1">
          {max.toFixed(1)} °C {t("future.stripes.hotter")}
        </span>
      </div>
    </Card>
  );
}
