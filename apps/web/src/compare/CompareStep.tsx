import { type EconomicsInput, rotationMargin } from "@itza/engine/economics";
import { loadPack } from "@itza/knowledge";
import { Button, EvidenceCard, RotationCompare, Skeleton } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { t } from "../copy";
import { fmt, formatDegrees, formatHectares } from "../lib/format";
import { useFieldStore } from "../state";
import { cardLabels, toCardView } from "./cards";
import { EconomicsPanel } from "./economics/EconomicsPanel";
import { MarginLine } from "./economics/MarginLine";
import { ReplayView } from "./ReplayView";
import { SeasonScoresChart } from "./SeasonScoresChart";
import { type CompareState, useCompare } from "./useCompare";
import { WhyNot } from "./WhyNot";

function Notice({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink">
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

/** The compare step: evidence cards side by side, "Why not X?" and the animated Season Replay. */
export function CompareStep() {
  const state = useCompare();
  const field = useFieldStore((s) => s.field);
  const { view, status } = state;
  const labels = useMemo(cardLabels, []);
  const names = useMemo(() => new Map(view?.rotations.map((r) => [r.id, r.name]) ?? []), [view]);
  const [economics, setEconomics] = useState<EconomicsInput>({});
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
      <p role="alert" className="rounded-control bg-risk-soft p-3 text-body text-risk-ink">
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

  const baselineName = view.baselineId ? (names.get(view.baselineId) ?? "") : "";
  const notice = baselineNotice(state, baselineName);
  const results = new Map(view.output.results.map((r) => [r.rotation_id, r]));
  const baseline = view.baselineId ? (results.get(view.baselineId) ?? null) : null;

  return (
    <div className="space-y-6">
      {field ? (
        <p className="text-body font-medium text-ink">
          {fmt(t("compare.field.line"), {
            area: formatHectares(field.areaHa),
            lat: formatDegrees(field.centroid[1], t("map.field.north"), t("map.field.south")),
            lon: formatDegrees(field.centroid[0], t("map.field.east"), t("map.field.west")),
          })}
        </p>
      ) : null}
      <p className="text-body text-ink-muted">{view.label}</p>
      {notice ? <Notice>{notice}</Notice> : null}
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
                  renderChart={(item) =>
                    result && item.source.startsWith("ITZA season replay") ? (
                      <SeasonScoresChart
                        result={result}
                        baseline={card.is_baseline ? null : baseline}
                      />
                    ) : null
                  }
                />
                {result ? <MarginLine margin={rotationMargin(result, economics)} /> : null}
              </div>
            ),
          };
        })}
      />
      <EconomicsPanel crops={crops} value={economics} onChange={setEconomics} />
      <WhyNot leftOut={view.leftOut} compareKey={state.key} />
      <ReplayView data={view} compareKey={state.key} economics={economics} />
      <Button asChild variant="secondary">
        <Link to="/future">{t("future.link")}</Link>
      </Button>
    </div>
  );
}
