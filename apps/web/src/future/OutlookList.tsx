import { Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { direction, percent, type RotationOutlook, rotationColor, shortNames } from "./analysis";

const BADGE = {
  up: "bg-good-soft text-good-ink",
  down: "bg-risk-soft text-risk-ink",
  flat: "bg-surface-muted text-ink",
} as const;
const ARROW = { up: "↑", down: "↓", flat: "→" } as const;

/**
 * One row per rotation, best 2050 rank first: rank and its move, a short name, today's score (ring)
 * and the 2050 score (dot) on one zoomed scale with the climate models' range shaded, and the change.
 */
export function OutlookList({
  rows,
  live,
  models,
}: {
  rows: readonly RotationOutlook[];
  /** False for the Today view: scores only, no 2050 marks or change. */
  live: boolean;
  models: number;
}) {
  const names = shortNames(rows.map((r) => r.name));
  const nameOf = new Map(rows.map((r, i) => [r.id, names[i] ?? r.name]));
  const span = (r: RotationOutlook) => ({
    lo: r.today * (1 + r.change.min / 100),
    hi: r.today * (1 + r.change.max / 100),
  });
  const values = rows.flatMap((r) => [r.today, r.future, span(r).lo, span(r).hi]);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const at = (v: number) => `${((v - lo) / Math.max(1, hi - lo)) * 100}%`;
  const sorted = [...rows].sort((a, b) => a.rankFuture - b.rankFuture || a.index - b.index);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">{t("future.list.title")}</h3>
        {live ? (
          <p className="flex items-center gap-3 text-caption text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full border-2 border-ink-muted" />
              {t("future.list.today")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-ink" />
              {t("future.list.future")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded-full bg-ink/25" />
              {fmt(t("future.list.models"), { models })}
            </span>
          </p>
        ) : null}
      </div>
      <ol className="divide-y divide-line-soft">
        {sorted.map((r) => {
          const color = rotationColor(r.index);
          const dir = direction(r.change.median);
          const move = r.rankToday - r.rankFuture;
          const band = span(r);
          return (
            <li
              key={r.id}
              className="grid grid-cols-[2.5rem_minmax(0,11rem)_minmax(0,1fr)_9rem] items-center gap-3 py-3 sm:grid-cols-[2.5rem_minmax(0,14rem)_minmax(0,1fr)_9rem]"
            >
              <div className="text-center leading-tight">
                <div className="text-title font-bold tabular-nums text-ink">{r.rankFuture}</div>
                {live && move !== 0 ? (
                  <div
                    className={`text-caption font-semibold ${move > 0 ? "text-good-ink" : "text-risk-ink"}`}
                  >
                    {move > 0 ? `▲${move}` : `▼${-move}`}
                  </div>
                ) : null}
              </div>
              <div className="min-w-0" title={r.name}>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-sm"
                    style={{ background: color }}
                  />
                  <span className="truncate font-semibold text-ink">{nameOf.get(r.id)}</span>
                </div>
                {live && r.drought !== 0 ? (
                  <div className="mt-0.5 truncate text-caption text-ink-muted">
                    {fmt(
                      t(r.drought < 0 ? "future.list.droughtFewer" : "future.list.droughtMore"),
                      {
                        count: Math.abs(r.drought),
                      },
                    )}
                  </div>
                ) : null}
              </div>
              <div className="relative h-7" aria-hidden="true">
                <div className="absolute inset-x-0 top-1/2 h-px bg-line-soft" />
                {live ? (
                  <>
                    <div
                      className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full opacity-30"
                      style={{
                        left: at(band.lo),
                        width: `calc(${at(band.hi)} - ${at(band.lo)})`,
                        background: color,
                      }}
                    />
                    <div
                      className="absolute top-1/2 h-0.5 -translate-y-1/2"
                      style={{
                        left: at(Math.min(r.today, r.future)),
                        width: `calc(${at(Math.max(r.today, r.future))} - ${at(Math.min(r.today, r.future))})`,
                        background: color,
                      }}
                    />
                  </>
                ) : null}
                <span
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                  style={{
                    left: at(r.today),
                    borderColor: live ? "var(--color-ink-muted)" : color,
                  }}
                />
                {live ? (
                  <span
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: at(r.future), background: color }}
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2 tabular-nums">
                <span className="text-caption text-ink-muted">
                  {live ? `${r.today} → ` : ""}
                  <b className="text-body text-ink">{live ? r.future : r.today}</b>
                </span>
                {live ? (
                  <span
                    className={`min-w-14 rounded-md px-2 py-0.5 text-center text-caption font-bold ${BADGE[dir]}`}
                  >
                    {ARROW[dir]} {percent(r.change.median)}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-[2.5rem_minmax(0,11rem)_minmax(0,1fr)_9rem] gap-3 sm:grid-cols-[2.5rem_minmax(0,14rem)_minmax(0,1fr)_9rem]">
        <span />
        <span className="text-caption text-ink-muted">{t("future.list.axis")}</span>
        <div className="flex justify-between text-caption tabular-nums text-ink-muted">
          <span>{lo}</span>
          <span>{Math.round((lo + hi) / 2)}</span>
          <span>{hi}</span>
        </div>
        <span />
      </div>
    </Card>
  );
}
