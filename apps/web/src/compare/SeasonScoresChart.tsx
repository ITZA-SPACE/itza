import type { RotationResult } from "@itza/engine/contracts";
import { t } from "../copy";
import { fmt } from "../lib/format";

const BAR_W = 14;
const GAP = 10;
const HEIGHT = 80;

/**
 * The evidence behind a card as a chart: a rotation's score in every replayed season next to the
 * current rotation's, from the same weather. Tapping an evidence item opens it.
 */
export function SeasonScoresChart({
  result,
  baseline,
}: {
  result: RotationResult;
  baseline: RotationResult | null;
}) {
  const seasons = result.seasons;
  const base = new Map((baseline?.seasons ?? []).map((s) => [s.season, s.composite]));
  const group = (baseline ? 2 : 1) * BAR_W + GAP;
  const width = Math.max(1, seasons.length) * group;
  return (
    <figure className="space-y-1">
      <figcaption className="text-caption font-medium text-ink">
        {t("compare.chart.title")}
      </figcaption>
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${HEIGHT + 14}`} className="h-24 w-full">
        {seasons.map((s, i) => {
          const x = i * group;
          const mine = s.composite * HEIGHT;
          const theirs = (base.get(s.season) ?? 0) * HEIGHT;
          return (
            <g key={s.season}>
              {baseline && base.has(s.season) ? (
                <rect
                  x={x}
                  y={HEIGHT - theirs}
                  width={BAR_W}
                  height={theirs}
                  className="fill-line"
                />
              ) : null}
              <rect
                x={x + (baseline ? BAR_W : 0)}
                y={HEIGHT - mine}
                width={BAR_W}
                height={mine}
                className="fill-cat-1"
              />
              <text x={x} y={HEIGHT + 11} fontSize={7} className="fill-ink-muted">
                {s.season}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="flex gap-3 text-caption text-ink-muted">
        {baseline ? (
          <li className="flex items-center gap-1">
            <span aria-hidden="true" className="size-2.5 bg-line" />
            {t("compare.chart.baseline")}
          </li>
        ) : null}
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="size-2.5 bg-cat-1" />
          {t("compare.chart.this")}
        </li>
      </ul>
      <ul className="sr-only">
        {seasons.map((s) => (
          <li key={s.season}>
            {fmt(t("compare.chart.summary"), { season: s.season, score: s.composite.toFixed(2) })}
          </li>
        ))}
      </ul>
    </figure>
  );
}
