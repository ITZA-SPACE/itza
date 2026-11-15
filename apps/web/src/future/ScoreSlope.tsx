import { Card } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { type RotationOutlook, rotationColor } from "./analysis";

const W = 420;
const H = 250;
const X0 = 54;
const X1 = 220;
const TOP = 34;
const BOTTOM = 222;

/** Today vs 2050 score per rotation, one line each, labelled at the 2050 end. */
export function ScoreSlope({ rows, models }: { rows: readonly RotationOutlook[]; models: number }) {
  const id = useId();
  const values = rows.flatMap((r) => [r.today, r.future]);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const y = (v: number) => BOTTOM - ((v - lo) / Math.max(1, hi - lo)) * (BOTTOM - TOP);
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(
    (_, i, all) => all.length <= 8 || i % 2 === 0,
  );
  // Spread labels that would overlap at the 2050 end.
  const labels = rows
    .map((r) => ({ r, y: y(r.future) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ r: RotationOutlook; y: number }[]>((out, item) => {
      const prev = out[out.length - 1];
      out.push({ ...item, y: prev && item.y - prev.y < 15 ? prev.y + 15 : item.y });
      return out;
    }, []);
  return (
    <Card className="space-y-2">
      <h3 id={`${id}-t`} className="text-body font-semibold text-ink">
        {t("future.slope.title")}
      </h3>
      <p className="text-caption text-ink-muted">{fmt(t("future.slope.body"), { models })}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={`${id}-t`}>
        <title>{t("future.slope.title")}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} className="stroke-line-soft" />
            <text x={X0 - 10} y={y(v) + 4} textAnchor="end" className="fill-ink-muted text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <text x={X0} y={18} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
          {t("future.slope.today")}
        </text>
        <text x={X1} y={18} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
          {t("future.slope.2050")}
        </text>
        {rows.map((r) => {
          const c = rotationColor(r.index);
          return (
            <g key={r.id}>
              <line x1={X0} y1={y(r.today)} x2={X1} y2={y(r.future)} stroke={c} strokeWidth={3} />
              <circle cx={X0} cy={y(r.today)} r={5} fill={c} />
              <circle cx={X1} cy={y(r.future)} r={5} fill={c} />
            </g>
          );
        })}
        {labels.map(({ r, y: ly }) => (
          <text
            key={r.id}
            x={X1 + 12}
            y={ly + 4}
            fill={rotationColor(r.index)}
            className="text-[12px] font-semibold"
          >
            {r.future} · {r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name}
          </text>
        ))}
      </svg>
    </Card>
  );
}
