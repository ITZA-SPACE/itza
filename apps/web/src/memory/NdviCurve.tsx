import type { FieldMemoryResult, SeasonResult } from "@itza/engine/memory";
import { useId, useMemo } from "react";
import { t } from "../copy";
import { EChart } from "../lib/EChart";
import { formatDate } from "../lib/format";
import { ACCENT, INK, INK_MUTED, LINE_SOFT, MARK, MARK_SOFT } from "../lib/palettes";

interface Point {
  date: string;
  smoothed: number | null;
  observed: number | null;
  /** 0 observed, 1 filled between observations, 2 left as a gap. */
  flag: number;
}

function pointsOf(grid: FieldMemoryResult["grid"], season: SeasonResult): Point[] {
  const { start, end } = season.phenology.period;
  const out: Point[] = [];
  grid.dates.forEach((date, i) => {
    if (date < start || date > end) return;
    const flag = grid.flags[i] as number;
    out.push({
      date,
      smoothed: grid.smoothed[i] ?? null,
      observed: flag === 0 ? (grid.ndvi[i] ?? null) : null,
      flag,
    });
  });
  return out;
}

const FLAG_COPY = ["memory.curve.observed", "memory.curve.filled", "memory.curve.gap"] as const;

/** The NDVI curve of one season, with its bare windows and peak, and the same numbers as a table. */
export function NdviCurve({
  grid,
  season,
}: {
  grid: FieldMemoryResult["grid"];
  season: SeasonResult;
}) {
  const id = useId();
  const points = useMemo(() => pointsOf(grid, season), [grid, season]);
  const { peak_date: peakDate, peak_ndvi: peakNdvi, bare_windows: bare } = season.phenology;

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      tooltip: { trigger: "axis" as const },
      xAxis: {
        type: "time" as const,
        axisLine: { lineStyle: { color: LINE_SOFT } },
        axisLabel: { color: INK_MUTED },
      },
      yAxis: {
        type: "value" as const,
        min: 0,
        max: 1,
        name: t("memory.curve.axis"),
        nameTextStyle: { color: INK_MUTED, align: "left" as const },
        axisLabel: { color: INK_MUTED },
        splitLine: { lineStyle: { color: LINE_SOFT } },
      },
      series: [
        {
          name: t("memory.curve.smoothed"),
          type: "line" as const,
          showSymbol: false,
          lineStyle: { color: ACCENT, width: 2.5 },
          itemStyle: { color: ACCENT },
          data: points.map((p) => [p.date, p.smoothed]),
          markArea: {
            silent: true,
            itemStyle: { color: MARK_SOFT },
            label: { show: false },
            data: bare.map((w) => [{ xAxis: w.start }, { xAxis: w.end }]),
          },
        },
        {
          name: t("memory.curve.observed"),
          type: "line" as const,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { width: 0 },
          itemStyle: { color: INK },
          data: points.filter((p) => p.observed !== null).map((p) => [p.date, p.observed]),
        },
        ...(peakDate && peakNdvi != null
          ? [
              {
                name: t("memory.curve.peak"),
                type: "line" as const,
                symbol: "diamond",
                symbolSize: 14,
                lineStyle: { width: 0 },
                itemStyle: { color: MARK },
                data: [[peakDate, peakNdvi]],
              },
            ]
          : []),
      ],
    }),
    [points, bare, peakDate, peakNdvi],
  );

  return (
    <figure className="space-y-2">
      <figcaption id={`${id}-title`} className="text-body font-medium text-ink">
        {t("memory.curve.title")}
      </figcaption>
      <EChart
        option={option}
        label={`${t("memory.curve.title")} ${season.phenology.season}`}
        height={220}
      />
      <p className="text-caption text-ink-muted">{t("memory.curve.legend")}</p>
      <details className="text-caption">
        <summary className="min-h-11 cursor-pointer py-2 text-accent-strong">
          {t("memory.curve.table")}
        </summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{t("memory.curve.title")}</caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("memory.curve.col.date")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("memory.curve.col.ndvi")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {t("memory.curve.col.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t border-line-soft">
                  <td className="py-1 pr-3">{formatDate(p.date)}</td>
                  <td className="py-1 pr-3">{p.smoothed === null ? "–" : p.smoothed.toFixed(2)}</td>
                  <td className="py-1">{t(FLAG_COPY[p.flag] ?? FLAG_COPY[2])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
