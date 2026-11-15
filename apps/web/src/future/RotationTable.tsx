import { Card, TableScroll } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { direction, percent, type RotationOutlook, rotationColor } from "./analysis";

const TONE = {
  up: "text-good-ink font-semibold",
  down: "text-risk-ink font-semibold",
  flat: "text-ink",
};
const ARROW = { up: "↑", down: "↓", flat: "→" };

function drought(change: number): string {
  if (change === 0) return t("future.table.drought.same");
  return fmt(t(change < 0 ? "future.table.drought.fewer" : "future.table.drought.more"), {
    count: Math.abs(change),
  });
}

/** One row per rotation, best 2050 rank first: rank move, score, change and model range. */
export function RotationTable({ rows, live }: { rows: readonly RotationOutlook[]; live: boolean }) {
  const sorted = [...rows].sort((a, b) => a.rankFuture - b.rankFuture || a.index - b.index);
  const tied = (r: RotationOutlook) => rows.filter((x) => x.rankToday === r.rankToday).length > 1;
  return (
    <Card className="space-y-2">
      <h3 className="text-body font-semibold text-ink">{t("future.table.title")}</h3>
      <TableScroll label={t("future.table.title")}>
        <table className="w-full text-body tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-caption font-semibold tracking-wide text-ink-muted uppercase">
              <th className="py-2 pr-3">{t("future.table.rotation")}</th>
              <th className="px-3 py-2 text-right">{t("future.table.rank")}</th>
              <th className="px-3 py-2 text-right">{t("future.table.score")}</th>
              {live ? (
                <>
                  <th className="px-3 py-2 text-right">{t("future.table.change")}</th>
                  <th className="px-3 py-2 text-right">{t("future.table.range")}</th>
                  <th className="py-2 pl-3 text-right">{t("future.table.drought")}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const dir = direction(r.change.median);
              const move = r.rankToday - r.rankFuture;
              return (
                <tr key={r.id} className="border-b border-line-soft last:border-0">
                  <td className="py-3 pr-3">
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-3 rounded-sm align-[-1px]"
                      style={{ background: rotationColor(r.index) }}
                    />
                    <span className="font-semibold text-ink">{r.name}</span>
                    {r.rankFuture === 1 ? (
                      <span className="ml-2 rounded bg-good-ink px-1.5 py-0.5 text-caption font-bold text-surface">
                        {t("future.table.best")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {r.rankToday}
                    {tied(r) ? "=" : ""} → <b>{r.rankFuture}</b>
                    {move > 0 ? <span className="ml-1 text-good-ink">▲{move}</span> : null}
                    {move < 0 ? <span className="ml-1 text-risk-ink">▼{-move}</span> : null}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {live ? (
                      <>
                        {r.today} → <b>{r.future}</b>
                      </>
                    ) : (
                      <b>{r.today}</b>
                    )}
                  </td>
                  {live ? (
                    <>
                      <td className={`px-3 py-3 text-right whitespace-nowrap ${TONE[dir]}`}>
                        {ARROW[dir]} {percent(r.change.median)}
                        {dir === "flat" ? (
                          <span className="ml-1 text-caption text-ink-muted">
                            {t("future.table.flat")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-ink-muted">
                        {fmt(t("future.table.range.value"), {
                          min: percent(r.change.min),
                          max: percent(r.change.max),
                        })}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap text-ink-muted">
                        {drought(r.drought)}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}
