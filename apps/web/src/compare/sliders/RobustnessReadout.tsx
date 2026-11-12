import { Card, ProvenanceChip, Skeleton } from "@itza/ui-kit";
import { useId } from "react";
import { type CopyKey, hasCopy, t } from "../../copy";
import { fmt } from "../../lib/format";
import type { CompareState } from "../useCompare";
import type { RobustnessRow } from "./robustness";
import { useRobustness } from "./useRobustness";

function scenarioName(id: string | null): string {
  const key = `sliders.robust.scenario.${id}`;
  return id !== null && hasCopy(key) ? t(key as CopyKey) : t("sliders.robust.scenario.custom");
}

function drop(row: RobustnessRow): string {
  return row.worstDrop.toFixed(2);
}

/** The rotation whose score falls least across the tested scenarios, and how far each one falls. */
export function RobustnessReadout({ state }: { state: CompareState }) {
  const id = useId();
  const { rows, error, pending } = useRobustness(state);
  const seasons = state.view?.seasons ?? [];
  const best = rows?.[0];
  return (
    <Card aria-labelledby={`${id}-title`} className="space-y-3">
      <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
        {t("sliders.robust.title")}
      </h3>
      <p className="text-body text-ink-muted">{t("sliders.robust.body")}</p>
      {error ? (
        <p role="alert" className="text-body text-risk-ink">
          {fmt(t("sliders.robust.error"), { message: error.message })}
        </p>
      ) : best && rows ? (
        <div className="space-y-3" aria-busy={pending}>
          <p className="text-body font-medium text-ink">
            {best.worstDrop > 0
              ? fmt(t("sliders.robust.best"), {
                  name: best.name,
                  drop: drop(best),
                  scenario: scenarioName(best.worstScenario),
                })
              : fmt(t("sliders.robust.bestNoDrop"), { name: best.name })}
          </p>
          <div className="space-y-1">
            <p className="text-caption font-semibold text-ink">{t("sliders.robust.list")}</p>
            <ol className="m-0 list-decimal space-y-1 pl-5 text-body text-ink">
              {rows.map((row) => (
                <li key={row.id}>
                  {row.worstDrop > 0
                    ? fmt(t("sliders.robust.row"), {
                        name: row.name,
                        drop: drop(row),
                        scenario: scenarioName(row.worstScenario),
                      })
                    : fmt(t("sliders.robust.rowNoDrop"), { name: row.name })}
                  {row.isBaseline ? ` (${t("sliders.robust.current")})` : ""}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-caption text-ink-muted">{t("sliders.robust.scale")}</p>
            {seasons.length > 0 ? (
              <ProvenanceChip
                source={t("sliders.provenance.source")}
                resolution={t("sliders.provenance.resolution")}
                period={fmt(t("sliders.provenance.period"), {
                  first: seasons[0]?.label ?? "",
                  last: seasons[seasons.length - 1]?.label ?? "",
                  n: seasons.length,
                })}
                labels={{
                  source: t("compare.provenance.source"),
                  resolution: t("compare.provenance.resolution"),
                  period: t("compare.provenance.period"),
                }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div aria-busy="true" className="space-y-2">
          <p role="status" className="text-body text-ink-muted">
            {t("sliders.robust.computing")}
          </p>
          <Skeleton className="h-16 w-full" />
        </div>
      )}
    </Card>
  );
}
