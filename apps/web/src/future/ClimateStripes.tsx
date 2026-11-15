import type { FutureResult } from "@itza/engine/worker";
import { Card } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { sspDetail } from "./labels";

/** Cool to hot, the same seven bins the app uses for climate stripes. */
const BINS = [
  "bg-div-neg-3",
  "bg-div-neg-2",
  "bg-div-neg-1",
  "bg-div-mid",
  "bg-div-pos-1",
  "bg-div-pos-2",
  "bg-div-pos-3",
] as const;

function binOf(value: number, min: number, max: number): number {
  if (max <= min) return 3;
  const share = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return Math.min(BINS.length - 1, Math.floor(share * BINS.length));
}

/**
 * The same real seasons, in the same order, before and after the 2050 warming: one square per season,
 * coloured by its average temperature on one shared scale. The headline counts the 2050 seasons that
 * would be hotter than the hottest season the farmer has actually had.
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
  const today = climate.find((row) => row.id === "today");
  const scenario = climate.find((row) => row.id !== "today");
  const hottestReal = today ? Math.max(...today.seasons.map((s) => s.meanTempC)) : null;
  const hotter =
    scenario && hottestReal !== null
      ? scenario.seasons.filter((s) => s.meanTempC > hottestReal).length
      : null;
  const seasons = today?.seasons ?? scenario?.seasons ?? [];
  const middle = seasons[Math.floor(seasons.length / 2)];
  return (
    <Card aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
          {t("future.stripes.title")}
        </h3>
        <p className="text-caption text-ink-muted">{t("future.stripes.body")}</p>
      </div>
      {hotter !== null && scenario ? (
        <p className="text-body text-ink">
          {fmt(t("future.stripes.headline"), {
            hotter,
            total: scenario.seasons.length,
            temp: hottestReal?.toFixed(1) ?? "",
          })}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(5.5rem,auto)_1fr] items-center gap-x-3 gap-y-2">
        {climate.map((row) => {
          const name =
            row.id === "today"
              ? t("future.stripes.today")
              : fmt(t("future.stripes.row"), { scenario: sspDetail(row.id) ?? row.id, year });
          return (
            <div key={row.id} className="contents">
              <span className="text-caption font-medium text-ink-muted">{name}</span>
              <ul
                aria-label={`${name}: ${t("future.stripes.label")}`}
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${row.seasons.length}, minmax(0, 1fr))` }}
              >
                {row.seasons.map((s) => {
                  const caption = fmt(t("future.stripes.caption"), {
                    row: name,
                    season: s.label,
                    temp: s.meanTempC.toFixed(1),
                    rain: Math.round(s.rainMm),
                  });
                  return (
                    <li
                      key={s.label}
                      title={caption}
                      className={`h-8 rounded-sm ${BINS[binOf(s.meanTempC, min, max)]} ${
                        row.id !== "today" && hottestReal !== null && s.meanTempC > hottestReal
                          ? "ring-2 ring-ink ring-inset"
                          : ""
                      }`}
                    >
                      <span className="sr-only">{caption}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <span />
        <div className="flex justify-between text-caption tabular-nums text-ink-muted">
          <span>{seasons[0]?.label}</span>
          <span>{middle?.label}</span>
          <span>{seasons[seasons.length - 1]?.label}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-muted">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span>{t("future.stripes.legend")}</span>
          <span className="font-semibold text-ink">{min.toFixed(1)} °C</span>
          {BINS.map((bin) => (
            <span key={bin} className={`inline-block h-3 w-5 rounded-sm ${bin}`} />
          ))}
          <span className="font-semibold text-ink">{max.toFixed(1)} °C</span>
        </span>
        {hotter ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm ring-2 ring-ink ring-inset"
            />
            {t("future.stripes.outlined")}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
