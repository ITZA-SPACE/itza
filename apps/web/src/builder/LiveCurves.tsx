import { type EconomicsInput, hasEconomics, marginPerHa } from "@itza/engine/economics";
import type { DesignSeason } from "@itza/engine/worker";
import { Card, Skeleton } from "@itza/ui-kit";
import { useId, useMemo } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";

const W = 100;
const H = 36;
const PAD = 4;

interface CurveSpec {
  id: "stress" | "nitrogen" | "cover" | "pest" | "margin";
  /** The season's value; null when there is none (a crop with no economics has no margin). */
  pick: (s: DesignSeason) => number | null;
  format: (v: number) => string;
  /** The value range of the axis, widened to fit the data. */
  range: (values: number[]) => [number, number];
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}`;

/** Indicative margin per hectare, from the farmer's own prices and the replay's yield factor. */
function marginCurve(economics: EconomicsInput): CurveSpec {
  return {
    id: "margin",
    pick: (s) => marginPerHa(economics[s.crop], s.yieldFactor),
    format: signed,
    range: (v) => {
      const bound = Math.max(1, ...v.map(Math.abs));
      return [Math.min(0, ...v, -bound * 0.1), Math.max(0, ...v, bound * 0.1)];
    },
  };
}

const CURVES: CurveSpec[] = [
  {
    id: "stress",
    pick: (s) => s.waterStressDays,
    format: (v) => String(Math.round(v)),
    range: (v) => [0, Math.max(10, ...v)],
  },
  {
    id: "nitrogen",
    pick: (s) => s.nitrogenKgHa,
    format: signed,
    range: (v) => {
      const bound = Math.max(30, ...v.map(Math.abs));
      return [-bound, bound];
    },
  },
  { id: "cover", pick: (s) => s.coverMonths, format: (v) => v.toFixed(1), range: () => [0, 12] },
  {
    id: "pest",
    pick: (s) => s.pestPressure,
    format: (v) => `${Math.round(v * 100)}%`,
    range: () => [0, 1],
  },
];

function Curve({
  spec,
  slots,
  seasons,
  names,
}: {
  spec: CurveSpec;
  slots: number;
  seasons: readonly DesignSeason[];
  names: ReadonlyMap<string, string>;
}) {
  const id = useId();
  const byPosition = new Map(seasons.map((s) => [s.position, s]));
  const values = seasons.flatMap((s) => {
    const v = spec.pick(s);
    return v === null ? [] : [v];
  });
  const [lo, hi] = spec.range(values);
  const x = (i: number) => ((i + 0.5) / slots) * W;
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  const known = Array.from({ length: slots }, (_, i) => byPosition.get(i)).map((s, i) => {
    const v = s ? spec.pick(s) : null;
    return v === null ? null : { i, v };
  });
  const path = known
    .flatMap((p) => (p ? [`${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`] : []))
    .join(" ");
  const unit = t(`builder.curves.${spec.id}.unit`);
  return (
    <figure className="space-y-1">
      <figcaption id={id} className="text-body font-medium text-ink">
        {t(`builder.curves.${spec.id}`)}{" "}
        <span className="text-caption font-normal text-ink-muted">({unit})</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="h-20 w-full">
        {lo < 0 ? (
          <line
            x1={0}
            x2={W}
            y1={y(0)}
            y2={y(0)}
            className="stroke-line"
            strokeDasharray="2 2"
            strokeWidth={0.4}
          />
        ) : null}
        <line
          x1={0}
          x2={W}
          y1={H - PAD}
          y2={H - PAD}
          className="stroke-line-soft"
          strokeWidth={0.4}
        />
        {path ? (
          <polyline
            points={path}
            className="fill-none stroke-accent"
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {known.map((p) =>
          p ? (
            <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={1.4} className="fill-accent-strong" />
          ) : null,
        )}
      </svg>
      <ol
        aria-labelledby={id}
        className="grid gap-1 text-center text-caption tabular-nums text-ink-muted"
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: slots }, (_, i) => {
          const s = byPosition.get(i);
          const v = s ? spec.pick(s) : null;
          return (
            <li
              key={s?.position ?? `gap-${i}`}
              aria-label={
                s && v !== null
                  ? fmt(t("builder.curves.point"), {
                      n: i + 1,
                      crop: names.get(s.crop) ?? s.crop,
                      value: spec.format(v),
                      unit,
                    })
                  : undefined
              }
            >
              {v === null ? "–" : spec.format(v)}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/**
 * Small curves, one point per season of the rotation, from the engine's replay of the field: four
 * always, and the indicative margin once the farmer has entered prices on the compare page.
 */
export function LiveCurves({
  seasons,
  slots,
  names,
  replayed,
  source,
  loading,
  error,
  economics,
}: {
  seasons: readonly DesignSeason[];
  slots: number;
  names: ReadonlyMap<string, string>;
  replayed: number;
  source: string;
  loading: boolean;
  error: string | null;
  economics: EconomicsInput;
}) {
  const curves = useMemo(
    () => (hasEconomics(economics) ? [...CURVES, marginCurve(economics)] : CURVES),
    [economics],
  );
  return (
    <Card className="space-y-3" aria-busy={loading}>
      <div className="space-y-1">
        <h2 className="text-title font-semibold text-ink">{t("builder.curves.title")}</h2>
        <p className="text-body text-ink-muted">
          {slots === 0
            ? t("builder.curves.empty")
            : fmt(t("builder.curves.body"), { seasons: replayed })}
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-control bg-risk-soft px-3 py-2 text-body text-risk-ink">
          {fmt(t("builder.curves.error"), { message: error })}
        </p>
      ) : null}
      {slots > 0 && seasons.length === 0 && loading ? <Skeleton className="h-40 w-full" /> : null}
      {slots > 0 && seasons.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {curves.map((spec) => (
            <Curve key={spec.id} spec={spec} slots={slots} seasons={seasons} names={names} />
          ))}
        </div>
      ) : null}
      {seasons.length > 0 && hasEconomics(economics) ? (
        <p className="text-caption text-ink-muted">{t("builder.curves.margin.note")}</p>
      ) : null}
      {seasons.length > 0 ? <p className="text-caption text-ink-muted">{source}</p> : null}
    </Card>
  );
}
