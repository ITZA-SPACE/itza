import type { FutureResult } from "@itza/engine/worker";
import { Card } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { signed, sspLabel } from "./labels";

export interface RotationRow {
  id: string;
  name: string;
  isBaseline: boolean;
}

const W = 300;
const H = 16;
const STEP = 0.05;

/** Axis half-width: the largest change in view, rounded up, never under 0.1. */
function axisOf(future: FutureResult): number {
  let largest = 0;
  for (const ssp of future.ssps) {
    for (const r of ssp.rotations) {
      largest = Math.max(largest, Math.abs(r.score.min), Math.abs(r.score.max));
    }
  }
  return Math.max(0.1, Math.ceil(largest / STEP) * STEP);
}

function RangeBar({
  median,
  min,
  max,
  axis,
  active,
}: {
  median: number;
  min: number;
  max: number;
  axis: number;
  active: boolean;
}) {
  const x = (v: number) => W / 2 + (v / axis) * (W / 2 - 6);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} className="h-4 w-full max-w-md">
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} className="stroke-ink" strokeWidth={1} />
      <line
        x1={x(min)}
        x2={x(max)}
        y1={H / 2}
        y2={H / 2}
        className={active ? "stroke-cat-6" : "stroke-line"}
        strokeWidth={active ? 5 : 3}
        strokeLinecap="round"
      />
      <circle cx={x(median)} cy={H / 2} r={active ? 5 : 4} className="fill-ink" />
    </svg>
  );
}

/**
 * Side by side, how each rotation's resilience score changes under each scenario: the median model
 * as a dot, the spread between models as a range. Every row names its scenario and model count.
 */
export function ResilienceChange({
  future,
  rotations,
  selected,
  models,
}: {
  future: FutureResult;
  rotations: readonly RotationRow[];
  /** The scenario the farmer picked; its rows are emphasized. */
  selected: string | null;
  /** How many climate models the median and range come from. */
  models: number;
}) {
  const id = useId();
  const axis = axisOf(future);
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("future.change.title")}
        </h3>
        <p className="text-body text-ink-muted">{t("future.change.body")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rotations.map((rotation) => {
          const rows = future.ssps.flatMap((ssp) => {
            const r = ssp.rotations.find((x) => x.rotation_id === rotation.id);
            return r ? [{ ssp: ssp.ssp, shift: r }] : [];
          });
          const history = rows[0]?.shift.history;
          return (
            <li key={rotation.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="text-body font-semibold text-ink">{rotation.name}</h4>
                  {rotation.isBaseline ? (
                    <span className="text-caption text-ink-muted">
                      {t("future.change.baseline")}
                    </span>
                  ) : null}
                  {history ? (
                    <span className="ml-auto text-caption tabular-nums text-ink-muted">
                      {fmt(t("future.change.today"), { score: history.score.toFixed(2) })}
                    </span>
                  ) : null}
                </div>
                {rows.map(({ ssp, shift }) => {
                  const active = ssp === selected;
                  const range = shift.score.min !== shift.score.max;
                  const text = fmt(t(range ? "future.change.row" : "future.change.rowNoRange"), {
                    scenario: sspLabel(ssp),
                    models,
                    median: signed(shift.score.median),
                    min: signed(shift.score.min),
                    max: signed(shift.score.max),
                  });
                  return (
                    <div key={ssp} className="space-y-1">
                      <p
                        className={
                          active ? "text-body font-semibold text-ink" : "text-body text-ink"
                        }
                      >
                        {text}
                      </p>
                      <RangeBar
                        median={shift.score.median}
                        min={shift.score.min}
                        max={shift.score.max}
                        axis={axis}
                        active={active}
                      />
                      <p className="text-caption text-ink-muted">
                        {fmt(t("future.change.stress"), {
                          change:
                            shift.severe_water_stress_seasons === 0
                              ? t("future.change.stressSame")
                              : signed(shift.severe_water_stress_seasons, 0),
                        })}
                      </p>
                    </div>
                  );
                })}
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-muted">
        {t("future.change.axis")}: −{axis.toFixed(2)} to +{axis.toFixed(2)}
      </p>
    </section>
  );
}
