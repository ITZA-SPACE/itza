import type { FutureResult } from "@itza/engine/worker";
import { Card } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { outlook, percent, type RotationRef, rotationColor } from "./analysis";
import { sspDetail } from "./labels";

const W = 560;
const LABEL = 172;
const ROW = 16;
const GROUP = 3 * ROW + 14;

/** % change of each rotation's score under every scenario: median model as a dot, models as a line. */
export function ScenarioChange({
  future,
  rotations,
  selected,
  models,
}: {
  future: FutureResult;
  rotations: readonly RotationRef[];
  selected: string | null;
  models: number;
}) {
  const id = useId();
  const perSsp = future.ssps.map((s) => ({ ssp: s.ssp, rows: outlook(future, rotations, s.ssp) }));
  const all = perSsp.flatMap((s) => s.rows.flatMap((r) => [r.change.min, r.change.max]));
  const lo = Math.min(-2, Math.floor(Math.min(...all) / 2) * 2);
  const hi = Math.max(2, Math.ceil(Math.max(...all) / 2) * 2);
  const ticks = Array.from({ length: (hi - lo) / 2 + 1 }, (_, i) => lo + i * 2);
  const x = (v: number) => LABEL + ((v - lo) / (hi - lo)) * (W - LABEL - 16);
  const groups = rotations.filter((r) => perSsp.some((s) => s.rows.some((x) => x.id === r.id)));
  const H = 24 + groups.length * GROUP + 22;
  return (
    <Card className="space-y-2">
      <h3 id={`${id}-t`} className="text-body font-semibold text-ink">
        {t("future.dots.title")}
      </h3>
      <p className="text-caption text-ink-muted">{fmt(t("future.dots.body"), { models })}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={`${id}-t`}>
        <title>{t("future.dots.title")}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={10}
              y2={H - 24}
              className={v === 0 ? "stroke-ink-muted" : "stroke-line-soft"}
              strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text x={x(v)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
              {percent(v)}
            </text>
          </g>
        ))}
        {groups.map((rotation, g) => {
          const index = rotations.findIndex((r) => r.id === rotation.id);
          const c = rotationColor(index);
          const top = 22 + g * GROUP;
          return (
            <g key={rotation.id}>
              <text x={0} y={top + ROW + 4} fill={c} className="text-[12px] font-semibold">
                {rotation.name.length > 24 ? `${rotation.name.slice(0, 23)}…` : rotation.name}
              </text>
              {perSsp.map(({ ssp, rows }, j) => {
                const r = rows.find((row) => row.id === rotation.id);
                if (!r) return null;
                const yy = top + j * ROW;
                const active = ssp === selected;
                const name = sspDetail(ssp) ?? ssp;
                return (
                  <g key={ssp}>
                    <title>
                      {fmt(t("future.dots.label"), {
                        rotation: rotation.name,
                        scenario: name,
                        median: percent(r.change.median),
                        min: percent(r.change.min),
                        max: percent(r.change.max),
                      })}
                    </title>
                    <text
                      x={LABEL - 12}
                      y={yy + 4}
                      textAnchor="end"
                      className={
                        active ? "fill-ink text-[11px] font-semibold" : "fill-ink-muted text-[11px]"
                      }
                    >
                      {name}
                    </text>
                    <line
                      x1={x(r.change.min)}
                      x2={x(r.change.max) + (r.change.min === r.change.max ? 0.1 : 0)}
                      y1={yy}
                      y2={yy}
                      stroke={c}
                      strokeWidth={4}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                    <circle
                      cx={x(r.change.median)}
                      cy={yy}
                      r={active ? 6 : 4}
                      fill={active ? c : "var(--color-surface)"}
                      stroke={c}
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Card>
  );
}
