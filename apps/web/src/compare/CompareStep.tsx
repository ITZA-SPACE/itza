import type { RotationMargin } from "@itza/engine/economics";
import { rotationMargin } from "@itza/engine/economics";
import { loadPack } from "@itza/knowledge";
import { Button, cn, Disclosure, EvidenceCard, Skeleton } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { FlowBar } from "../app/shell/FlowBar";
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
import { asSequence, PlanCards, planIds } from "./PlanCards";
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
  const [picked, setPicked] = useState<string | null>(null);
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

  const ranked = [...view.cards].sort((a, b) => b.score - a.score);
  const best = ranked.find((c) => !c.is_baseline) ?? ranked[0];
  const chosen = view.cards.find((c) => c.rotation_id === picked) ?? best;
  const chosenResult = chosen ? results.get(chosen.rotation_id) : undefined;
  const chosenName = chosen ? (names.get(chosen.rotation_id) ?? chosen.rotation_id) : "";

  return (
    <div className="space-y-6">
      {notice && state.baselineSource === "none" ? <Notice>{notice}</Notice> : null}
      <div
        aria-busy={state.refreshing}
        className={state.refreshing ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}
      >
        <PlanCards view={view} selected={chosen?.rotation_id ?? null} onSelect={setPicked} />

        {chosen ? (
          <section aria-labelledby="plan-why" className="glass-panel space-y-4 rounded-card p-5">
            <div className="min-w-0 space-y-1">
              <h2 id="plan-why" className="font-display text-title font-semibold text-ink">
                {asSequence(chosenName)}
              </h2>
              <p className="text-body text-ink-muted">{chosen.why}</p>
            </div>
            {chosen.risks.length > 0 ? (
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {chosen.risks.slice(0, 3).map((risk) => (
                  <li
                    key={risk}
                    className="rounded-panel border border-warn-ink/30 bg-warn-soft/50 px-3 py-1.5 text-caption text-warn-ink"
                  >
                    {risk}
                  </li>
                ))}
              </ul>
            ) : null}
            {chosenResult ? (
              <SeasonScoresChart
                result={chosenResult}
                baseline={chosen.is_baseline ? null : baseline}
              />
            ) : null}
            <Disclosure
              summary={t("compare.card.details")}
              count={chosen.evidence.length + chosen.benefits.length + chosen.gaps.length}
            >
              <EvidenceCard
                className="border-0 bg-transparent p-0 shadow-none"
                card={toCardView(chosen, chosenName)}
                labels={labels}
                extraDetails={
                  <GaezEvidence
                    packId={view.packId}
                    cropIds={chosenResult?.seasons.map((season) => season.crop) ?? []}
                    centroid={field?.centroid}
                  />
                }
                footer={<AskAboutThis kind="card" id={chosen.rotation_id} label={chosenName} />}
              />
              {chosenResult ? (
                <PricedMargin margin={rotationMargin(chosenResult, economics)} />
              ) : null}
            </Disclosure>
          </section>
        ) : null}

        <ReplayView
          data={view}
          compareKey={state.refreshing ? null : state.key}
          economics={economics}
          laneIds={planIds(view)}
          {...(initialSeason ? { initialSeason } : {})}
        />

        <Disclosure summary={fmt(t("plan.all"), { n: view.cards.length })}>
          <RankingList view={view} />
        </Disclosure>
        <Disclosure summary={`${t("sliders.title")} · ${shownScenario(view.output.scenario_id)}`}>
          <div className="space-y-5">
            <SliderPanel state={state} />
            <RobustnessReadout state={state} />
          </div>
        </Disclosure>
        <Disclosure summary={t("plan.more")}>
          <div className="space-y-4">
            <WhyNot leftOut={view.leftOut} compareKey={state.refreshing ? null : state.key} />
            <EconomicsPanel crops={crops} value={economics} onChange={setEconomics} />
          </div>
        </Disclosure>
      </div>

      <p className="text-caption text-subtle">{view.label}</p>
      <FlowBar question={t("plan.flow")}>
        <Button asChild variant="secondary">
          <Link to="/inputs">
            <SlidersHorizontal aria-hidden />
            {t("plan.adjust")}
          </Link>
        </Button>
        <ShareBar view={view} />
        <Button asChild>
          <Link to="/future">
            {t("plan.future")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </FlowBar>
    </div>
  );
}
