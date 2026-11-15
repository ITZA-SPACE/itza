import type { RotationMargin } from "@itza/engine/economics";
import { rotationMargin } from "@itza/engine/economics";
import { loadPack } from "@itza/knowledge";
import { Badge, cn, Disclosure, EvidenceCard, RotationCompare, Skeleton } from "@itza/ui-kit";
import { useMemo } from "react";
import { AskAboutThis } from "../assistant";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { ShareBar } from "../report/ShareBar";
import { useFieldStore } from "../state";
import { cardLabels, toCardView } from "./cards";
import { EconomicsPanel } from "./economics/EconomicsPanel";
import { useEconomicsStore } from "./economics/economicsStore";
import { MarginLine } from "./economics/MarginLine";

/** The card's margin line, only once the farmer has entered prices (no line of dashes before). */
function PricedMargin({ margin }: { margin: RotationMargin }) {
  return margin.meanMargin === null ? null : <MarginLine margin={margin} />;
}

import { GaezEvidence } from "./GaezEvidence";
import { ReplayView } from "./ReplayView";
import { SeasonScoresChart } from "./SeasonScoresChart";
import { RobustnessReadout, SliderPanel, shownScenario } from "./sliders";
import { type CompareState, useCompare } from "./useCompare";
import { WhyNot } from "./WhyNot";

function Notice({ children }: { children: string }) {
  return (
    <p
      role="status"
      className="rounded-panel border border-warn-ink/40 bg-warn-soft px-4 py-3 text-body text-warn-ink"
    >
      {children}
    </p>
  );
}

function baselineNotice(state: CompareState, rotationName: string): string | null {
  if (state.baselineRejected) return t("compare.baseline.rejected");
  if (state.baselineSource === "none") return t("compare.baseline.none");
  if (state.baselineSource === "inferred")
    return fmt(t("compare.baseline.inferred"), { rotation: rotationName });
  if (state.baselineSource === "confirmed")
    return fmt(t("compare.baseline.confirmed"), { rotation: rotationName });
  return null;
}

/** The rotations ranked by score, one bar each: what the demo's slider beat watches move. */
function RankingList({ view }: { view: NonNullable<CompareState["view"]> }) {
  const names = new Map(view.rotations.map((r) => [r.id, r.name]));
  const ranked = [...view.cards].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 1;
  return (
    <ol
      className="glass-panel space-y-3 rounded-card p-4 sm:p-5"
      aria-label={t("compare.cards.label")}
    >
      {ranked.map((card, i) => (
        <li
          key={card.rotation_id}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
        >
          <span className="font-display text-title font-bold text-ink-muted tabular-nums">
            {i + 1}
          </span>
          <span className="truncate text-body font-semibold text-ink">
            {names.get(card.rotation_id) ?? card.rotation_id}
            {card.is_baseline ? (
              <span className="ml-2 text-caption font-normal text-ink-muted">
                {t("compare.baseline.badge")}
              </span>
            ) : null}
          </span>
          <span className="font-display text-title font-bold text-ink tabular-nums">
            {card.score.toFixed(2)}
          </span>
          <span
            aria-hidden="true"
            className="col-start-2 col-end-4 h-2 overflow-hidden rounded-full bg-glass-strong"
          >
            <span
              className={cn("block h-full rounded-full", i === 0 ? "bg-aurora" : "bg-ink-muted/60")}
              style={{ width: `${Math.max(4, (card.score / top) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The compare step: evidence cards side by side, "Why not X?" and the animated Season Replay.
 * `focus` narrows it for the guided demo: only the replay, or only the sliders and the ranking.
 */
export function CompareStep({
  initialSeason,
  focus,
}: {
  initialSeason?: string;
  focus?: "replay" | "sliders";
} = {}) {
  const state = useCompare();
  const field = useFieldStore((s) => s.field);
  const { view, status } = state;
  const labels = useMemo(cardLabels, []);
  const names = useMemo(() => new Map(view?.rotations.map((r) => [r.id, r.name]) ?? []), [view]);
  const economics = useEconomicsStore((s) => s.economics);
  const setEconomics = useEconomicsStore((s) => s.setEconomics);
  // Crops the compared rotations grow, named from the region pack; fallow and cover have no price.
  const crops = useMemo(() => {
    if (!view) return [];
    const grown = new Set(view.output.results.flatMap((r) => r.seasons.map((s) => s.crop)));
    return loadPack(view.packId)
      .crops.filter((c) => c.kind === "crop" && grown.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
  }, [view]);

  if (status === "no-field") return null;
  if (status === "error") {
    return (
      <p
        role="alert"
        className="rounded-panel border border-risk-ink/40 bg-risk-soft px-4 py-3 text-body text-risk-ink"
      >
        {fmt(t("compare.error"), { message: state.error?.message ?? "" })}
      </p>
    );
  }
  if (!view) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-body text-ink-muted">
          {status === "loading-data" ? t("compare.loading.data") : t("compare.loading.compute")}
        </p>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (focus === "replay") {
    return (
      <ReplayView
        data={view}
        compareKey={state.refreshing ? null : state.key}
        economics={economics}
        {...(initialSeason ? { initialSeason } : {})}
      />
    );
  }
  if (focus === "sliders") {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SliderPanel state={state} />
        <div
          className={state.refreshing ? "space-y-4 opacity-60 transition-opacity" : "space-y-4"}
          aria-busy={state.refreshing}
        >
          <RankingList view={view} />
          <RobustnessReadout state={state} />
        </div>
      </div>
    );
  }

  const baselineName = view.baselineId ? (names.get(view.baselineId) ?? "") : "";
  const notice = baselineNotice(state, baselineName);
  const results = new Map(view.output.results.map((r) => [r.rotation_id, r]));
  const baseline = view.baselineId ? (results.get(view.baselineId) ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="warn">{view.label}</Badge>
        <ShareBar view={view} />
      </div>
      {notice ? <Notice>{notice}</Notice> : null}
      <Disclosure summary={`${t("sliders.title")} · ${shownScenario(view.output.scenario_id)}`}>
        <SliderPanel state={state} />
      </Disclosure>
      <div
        aria-busy={state.refreshing}
        className={state.refreshing ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}
      >
        <RotationCompare
          label={t("compare.cards.label")}
          items={view.cards.map((card) => {
            const result = results.get(card.rotation_id);
            return {
              id: card.rotation_id,
              isBaseline: card.is_baseline,
              content: (
                <div className="space-y-3">
                  <EvidenceCard
                    card={toCardView(card, names.get(card.rotation_id) ?? card.rotation_id)}
                    labels={labels}
                    extraDetails={
                      <GaezEvidence
                        packId={view.packId}
                        cropIds={result?.seasons.map((season) => season.crop) ?? []}
                        centroid={field?.centroid}
                      />
                    }
                    footer={
                      <div>
                        <AskAboutThis
                          kind="card"
                          id={card.rotation_id}
                          label={names.get(card.rotation_id) ?? card.rotation_id}
                        />
                      </div>
                    }
                    renderChart={(item) =>
                      result && item.source.startsWith("ITZA season replay") ? (
                        <SeasonScoresChart
                          result={result}
                          baseline={card.is_baseline ? null : baseline}
                        />
                      ) : null
                    }
                  />
                  {result ? <PricedMargin margin={rotationMargin(result, economics)} /> : null}
                </div>
              ),
            };
          })}
        />
        <ReplayView
          data={view}
          compareKey={state.refreshing ? null : state.key}
          economics={economics}
          {...(initialSeason ? { initialSeason } : {})}
        />
        <RobustnessReadout state={state} />
        <WhyNot leftOut={view.leftOut} compareKey={state.refreshing ? null : state.key} />
        <EconomicsPanel crops={crops} value={economics} onChange={setEconomics} />
      </div>
    </div>
  );
}
