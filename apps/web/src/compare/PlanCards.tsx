import type { RotationResult } from "@itza/engine/contracts";
import { cn, focusRing } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import type { CompareState } from "./useCompare";

type View = NonNullable<CompareState["view"]>;
type Card = View["cards"][number];

const TONE = {
  best: { ring: "border-leaf/60 bg-leaf/5", ink: "text-leaf", tick: "bg-leaf" },
  option: { ring: "border-rim-card", ink: "text-harvest", tick: "bg-harvest" },
  today: { ring: "border-rim-card", ink: "text-ink", tick: "bg-ink-muted" },
} as const;

const DOTS = { high: 3, medium: 2, low: 1 } as const;

/** "Wheat, Fallow" reads as a sequence: "Wheat → Fallow". */
export const asSequence = (name: string): string => name.split(", ").join(" → ");

/**
 * One tick per replayed season, lit where this rotation scored above the current one (for the
 * current rotation itself, every season is a plain tick). The engine's own per-season scores.
 */
function SeasonStrip({
  result,
  baseline,
  tick,
  label,
}: {
  result: RotationResult;
  baseline: RotationResult | null;
  tick: string;
  label: string;
}) {
  const today = new Map(baseline?.seasons.map((s) => [s.season, s.composite]) ?? []);
  return (
    <div role="img" aria-label={label} className="flex h-6 items-stretch gap-[3px]">
      {result.seasons.map((s) => {
        const base = today.get(s.season);
        const better = base !== undefined && s.composite > base;
        return (
          <span
            key={s.season}
            title={`${s.season}: ${s.composite.toFixed(2)}`}
            className={cn(
              "min-w-0 flex-1 self-end rounded-[3px]",
              better ? tick : baseline ? "bg-glass-strong" : "bg-ink-muted/50",
            )}
            style={baseline ? { height: "100%" } : { height: `${Math.round(s.composite * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Figma "Plan": the best fit, the runner-up and today's rotation as three cards, each one big
 * number (seasons of severe water stress), a season strip and the confidence. Tap one to read why.
 */
/** The rotations the Plan shows: best fit, runner-up and today, in that order. */
export function planIds(view: View): string[] {
  const ranked = [...view.cards].sort((a, b) => b.score - a.score);
  const others = ranked.filter((c) => !c.is_baseline).slice(0, 2);
  const today = ranked.find((c) => c.is_baseline);
  return [...others, ...(today ? [today] : [])].map((c) => c.rotation_id);
}

export function PlanCards({
  view,
  selected,
  onSelect,
}: {
  view: View;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const names = new Map(view.rotations.map((r) => [r.id, r.name]));
  const results = new Map(view.output.results.map((r) => [r.rotation_id, r]));
  const baseline = view.baselineId ? (results.get(view.baselineId) ?? null) : null;
  const ranked = [...view.cards].sort((a, b) => b.score - a.score);
  const others = ranked.filter((c) => !c.is_baseline).slice(0, 2);
  const today = ranked.find((c) => c.is_baseline);
  const shown: { card: Card; kind: keyof typeof TONE }[] = [
    ...others.map((card, i) => ({ card, kind: i === 0 ? ("best" as const) : ("option" as const) })),
    ...(today ? [{ card: today, kind: "today" as const }] : []),
  ];
  return (
    <ul aria-label={t("compare.cards.label")} className="grid list-none gap-4 p-0 md:grid-cols-3">
      {shown.map(({ card, kind }) => {
        const result = results.get(card.rotation_id);
        if (!result) return null;
        const tone = TONE[kind];
        const total = result.seasons.length;
        const wins = baseline
          ? result.seasons.filter(
              (s, i) => s.composite > (baseline.seasons[i]?.composite ?? Number.POSITIVE_INFINITY),
            ).length
          : 0;
        const on = selected === card.rotation_id;
        // Without a current rotation there is nothing to beat: show the plain score instead.
        const plain = kind === "today" || !baseline;
        return (
          <li key={card.rotation_id} className="flex">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(card.rotation_id)}
              className={cn(
                "glass-panel flex w-full flex-col gap-4 rounded-card p-5 text-left transition-colors hover:border-rim-strong",
                tone.ring,
                on && "ring-2 ring-rain/70",
                focusRing,
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 self-start rounded-full border border-current/40 px-2.5 py-0.5 text-[0.75rem] font-bold",
                  tone.ink,
                )}
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {t(`plan.badge.${kind}`)}
              </span>
              <span
                title={names.get(card.rotation_id)}
                className="line-clamp-2 min-h-[2lh] font-display text-title leading-snug font-bold text-ink"
              >
                {asSequence(names.get(card.rotation_id) ?? card.rotation_id)}
              </span>
              <span className="space-y-0.5">
                <span
                  className={cn(
                    "block font-display text-[4.5rem] leading-none font-bold tabular-nums",
                    tone.ink,
                  )}
                >
                  {result.resilience.severe_water_stress_seasons}
                </span>
                <span className="block text-caption text-ink-muted">
                  {fmt(t("plan.stress"), { total })}
                </span>
              </span>
              <SeasonStrip
                result={result}
                baseline={plain ? null : baseline}
                tick={tone.tick}
                label={
                  plain
                    ? fmt(t("plan.strip.today"), { total })
                    : fmt(t("plan.strip"), { wins, total })
                }
              />
              <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
                <span>
                  {plain
                    ? fmt(t("plan.score"), { score: card.score.toFixed(2) })
                    : fmt(t("plan.wins"), { wins, total })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="inline-flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "size-1.5 rounded-full border border-current",
                          i < DOTS[card.confidence.level] && "bg-current",
                        )}
                      />
                    ))}
                  </span>
                  {t(`confidence.${card.confidence.level}`)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
