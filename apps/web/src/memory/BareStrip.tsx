import type { BareMatrix } from "@itza/engine/memory";
import { TableScroll } from "@itza/ui-kit";
import { useId, useMemo } from "react";
import { t } from "../copy";
import { EChart } from "../lib/EChart";
import { CELL_GAP, INK_MUTED, SEQUENTIAL } from "../lib/palettes";

const monthName = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const nameOf = (month: number) => monthName.format(new Date(Date.UTC(2001, month - 1, 1)));

/** Share of each month of each season spent bare, as a heat strip (month by year) and a table. */
export function BareStrip({ matrix }: { matrix: BareMatrix }) {
  const id = useId();
  const months = useMemo(() => matrix.months.map(nameOf), [matrix.months]);
  const seasons = matrix.rows.map((r) => r.season);

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 44, right: 12, top: 8, bottom: 76 },
      tooltip: {
        formatter: (p: { value: [number, number, number] }) => {
          const [x, y, share] = p.value;
          return `${seasons[x]} ${months[y]}: ${Math.round(share * 100)}%`;
        },
      },
      xAxis: {
        type: "category" as const,
        data: seasons,
        axisLabel: {
          color: INK_MUTED,
          interval: seasons.length > 12 ? 1 : 0,
          rotate: seasons.length > 8 ? 45 : 0,
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category" as const,
        data: months,
        inverse: true,
        axisLabel: { color: INK_MUTED },
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: false,
        orient: "horizontal" as const,
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: 120,
        textStyle: { color: INK_MUTED },
        formatter: (v: number) => `${Math.round(v * 100)}%`,
        inRange: { color: [...SEQUENTIAL] },
      },
      series: [
        {
          type: "heatmap" as const,
          data: matrix.rows.flatMap((row, x) =>
            row.bareShare.flatMap((share, y) => (share === null ? [] : [[x, y, share]])),
          ),
          itemStyle: { borderColor: CELL_GAP, borderWidth: 1 },
        },
      ],
    }),
    [matrix.rows, months, seasons],
  );

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("memory.bare.title")}
        </h3>
        <p className="text-body text-ink-muted">{t("memory.bare.body")}</p>
      </div>
      <EChart
        option={option}
        label={t("memory.bare.title")}
        height={Math.max(260, 40 + months.length * 20)}
      />
      <details className="text-caption">
        <summary className="min-h-11 cursor-pointer py-2 text-accent-strong">
          {t("memory.bare.table")}
        </summary>
        <TableScroll label={t("memory.bare.title")}>
          <table className="w-full text-left">
            <caption className="sr-only">{t("memory.bare.title")}</caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("memory.bare.col.season")}
                </th>
                {months.map((m) => (
                  <th key={m} scope="col" className="px-1 py-1 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.season} className="border-t border-line-soft">
                  <th scope="row" className="py-1 pr-3 font-medium text-ink">
                    {row.season}
                  </th>
                  {row.bareShare.map((share, i) => (
                    <td key={months[i]} className="px-1 py-1">
                      {share === null ? "–" : `${Math.round(share * 100)}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </details>
    </section>
  );
}
