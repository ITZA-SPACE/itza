import { Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { direction, percent, type RotationOutlook, rotationColor, shortNames } from "./analysis";

const BAR = {
  up: "var(--color-good-ink)",
  down: "var(--color-risk-ink)",
  flat: "var(--color-ink-muted)",
} as const;
const TEXT = { up: "text-good-ink", down: "text-risk-ink", flat: "text-ink-muted" } as const;
const COLS =
  "grid grid-cols-[2rem_minmax(0,10rem)_minmax(0,1fr)_4.5rem] items-center gap-3 sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_5rem]";

/**
 * One row per rotation, best 2050 rank first. The bar grows from zero: left and red when the rotation
 * scores worse in 2050, right and green when better; the thin line is the range over the climate
 * models. The scale is fixed and symmetric so a small change looks small. In the Today view the bars
 * are plain scores out of 100.
 */
export function OutlookList({
  rows,
  live,
  models,
}: {
  rows: readonly RotationOutlook[];
  live: boolean;
  models: number;
}) {
  const names = shortNames(rows.map((r) => r.name));
  const nameOf = new Map(rows.map((r, i) => [r.id, names[i] ?? r.name]));
  const largest = Math.max(
    0,
    ...rows.flatMap((r) => [Math.abs(r.change.min), Math.abs(r.change.max)]),
  );
  const axis = Math.max(10, Math.ceil(largest / 5) * 5);
  // Position of a % change on the bar track: 0% is the middle.
  const at = (v: number) => 50 + (Math.max(-axis, Math.min(axis, v)) / axis) * 50;
  const sorted = [...rows].sort((a, b) => a.rankFuture - b.rankFuture || a.index - b.index);
  return (
    <Card className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-body font-semibold text-ink">{t("future.list.title")}</h3>
        <p className="text-caption text-ink-muted">
          {live ? fmt(t("future.list.howto"), { models }) : t("future.list.howtoToday")}
        </p>
      </div>
      <ol className="divide-y divide-line-soft">
        {sorted.map((r) => {
          const dir = direction(r.change.median);
          const move = r.rankToday - r.rankFuture;
          const from = Math.min(at(0), at(r.change.median));
          const to = Math.max(at(0), at(r.change.median));
          return (
            <li key={r.id} className={`${COLS} py-3`}>
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
                    style={{ background: rotationColor(r.index) }}
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
              <div className="relative h-8" aria-hidden="true">
                {live ? (
                  <>
                    <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink-muted" />
                    <div
                      className="absolute top-1/2 h-px -translate-y-1/2 bg-ink/50"
                      style={{
                        left: `${at(r.change.min)}%`,
                        width: `${at(r.change.max) - at(r.change.min)}%`,
                      }}
                    />
                    <div
                      className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm"
                      style={{
                        left: `${from}%`,
                        width: `max(${to - from}%, 3px)`,
                        background: BAR[dir],
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 rounded-sm bg-surface-muted" />
                    <div
                      className="absolute top-1/2 left-0 h-4 -translate-y-1/2 rounded-sm"
                      style={{ width: `${r.today}%`, background: rotationColor(r.index) }}
                    />
                  </>
                )}
              </div>
              <div className="text-right leading-tight tabular-nums">
                {live ? (
                  <>
                    <div className={`text-body font-bold ${TEXT[dir]}`}>
                      {percent(r.change.median)}
                    </div>
                    <div className="text-caption text-ink-muted">
                      {r.today} → {r.future}
                    </div>
                  </>
                ) : (
                  <div className="text-body font-bold text-ink">{r.today}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className={COLS}>
        <span />
        <span />
        {live ? (
          <div className="relative h-4 text-caption tabular-nums text-ink-muted">
            <span className="absolute left-0">{percent(-axis)}</span>
            <span className="absolute left-1/4 -translate-x-1/2">{t("future.list.worse")}</span>
            <span className="absolute left-1/2 -translate-x-1/2">0%</span>
            <span className="absolute left-3/4 -translate-x-1/2">{t("future.list.better")}</span>
            <span className="absolute right-0">{percent(axis)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-caption tabular-nums text-ink-muted">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        )}
        <span />
      </div>
    </Card>
  );
}
