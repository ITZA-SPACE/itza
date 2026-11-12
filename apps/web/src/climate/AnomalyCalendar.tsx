import type { SeasonIndicators } from "@itza/engine/climate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@itza/ui-kit";
import { useId, useMemo } from "react";
import { t } from "../copy";
import { EChart } from "../lib/EChart";
import { DIVERGING, INK_MUTED } from "../lib/palettes";
import { formatNumber } from "./indicators";

type Kind = "rain" | "soil";

const monthName = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const WET_FIRST = [...DIVERGING].reverse();

interface Grid {
  seasons: string[];
  months: string[];
  /** Per season, per month: the anomaly or null. */
  cells: (number | null)[][];
}

/** Rain: percent above or below the same month's average over the seasons. Soil: the monthly z-score. */
function gridOf(seasons: readonly SeasonIndicators[], kind: Kind): Grid {
  const first = seasons[0];
  const months = (first?.months ?? []).map((m) =>
    monthName.format(new Date(`${m.period.start}T00:00:00Z`)),
  );
  const cells = seasons.map((s, si) =>
    s.months.map((m, mi) => {
      if (kind === "soil") return m.soilMoistureZ;
      const same = seasons.map((x) => x.months[mi]?.rainMm ?? 0);
      const mean = same.reduce((a, b) => a + b, 0) / same.length;
      return mean > 0 && si >= 0 ? ((m.rainMm - mean) / mean) * 100 : null;
    }),
  );
  return { seasons: seasons.map((s) => s.label), months, cells };
}

function Calendar({ grid, kind }: { grid: Grid; kind: Kind }) {
  const limit = kind === "rain" ? 100 : 2.5;
  const unit = kind === "rain" ? "%" : "";
  const digits = kind === "rain" ? 0 : 1;
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 44, right: 12, top: 8, bottom: 56 },
      tooltip: {
        formatter: (p: { value: [number, number, number] }) => {
          const [x, y, v] = p.value;
          return `${grid.seasons[x]} ${grid.months[y]}: ${v > 0 ? "+" : ""}${formatNumber(v, digits)}${unit}`;
        },
      },
      xAxis: {
        type: "category" as const,
        data: grid.seasons,
        axisLabel: {
          color: INK_MUTED,
          interval: grid.seasons.length > 12 ? 1 : 0,
          rotate: grid.seasons.length > 8 ? 45 : 0,
        },
      },
      yAxis: {
        type: "category" as const,
        data: grid.months,
        inverse: true,
        axisLabel: { color: INK_MUTED },
      },
      visualMap: {
        min: -limit,
        max: limit,
        calculable: false,
        orient: "horizontal" as const,
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: 140,
        textStyle: { color: INK_MUTED },
        formatter: (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v, digits)}${unit}`,
        inRange: { color: WET_FIRST },
      },
      series: [
        {
          type: "heatmap" as const,
          data: grid.cells.flatMap((row, x) =>
            row.flatMap((v, y) =>
              v === null ? [] : [[x, y, Math.max(-limit, Math.min(limit, v))]],
            ),
          ),
          itemStyle: { borderColor: "#ffffff", borderWidth: 1 },
        },
      ],
    }),
    [grid, limit, unit, digits],
  );
  return (
    <div className="space-y-2">
      <EChart
        option={option}
        label={t(kind === "rain" ? "climate.calendar.rain" : "climate.calendar.soil")}
        height={Math.max(280, 60 + grid.months.length * 20)}
      />
      <details className="text-caption">
        <summary className="min-h-11 cursor-pointer py-2 text-accent-strong">
          {t("climate.calendar.table")}
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              {t(kind === "rain" ? "climate.calendar.rain" : "climate.calendar.soil")}
            </caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("climate.calendar.col.season")}
                </th>
                {grid.months.map((m) => (
                  <th key={m} scope="col" className="px-1 py-1 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.cells.map((row, i) => (
                <tr key={grid.seasons[i]} className="border-t border-line-soft">
                  <th scope="row" className="py-1 pr-3 font-medium text-ink">
                    {grid.seasons[i]}
                  </th>
                  {row.map((v, j) => (
                    <td key={grid.months[j]} className="px-1 py-1">
                      {v === null ? "–" : `${v > 0 ? "+" : ""}${formatNumber(v, digits)}${unit}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Month by season anomalies of rain and of soil moisture, as heat maps with the numbers in a table. */
export function AnomalyCalendar({ seasons }: { seasons: readonly SeasonIndicators[] }) {
  const id = useId();
  const rain = useMemo(() => gridOf(seasons, "rain"), [seasons]);
  const soil = useMemo(() => gridOf(seasons, "soil"), [seasons]);
  const hasSoil = soil.cells.some((row) => row.some((v) => v !== null));
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("climate.calendar.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("climate.calendar.body")}</p>
      </div>
      <Tabs defaultValue="rain">
        <TabsList aria-label={t("climate.calendar.title")}>
          <TabsTrigger value="rain">{t("climate.calendar.tab.rain")}</TabsTrigger>
          {hasSoil ? (
            <TabsTrigger value="soil">{t("climate.calendar.tab.soil")}</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="rain">
          <Calendar grid={rain} kind="rain" />
        </TabsContent>
        {hasSoil ? (
          <TabsContent value="soil">
            <Calendar grid={soil} kind="soil" />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}
