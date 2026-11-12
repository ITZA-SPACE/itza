import { Badge, Card, Skeleton } from "@itza/ui-kit";
import { useMemo } from "react";
import { t } from "../copy";
import { useFieldBundle } from "../data";
import { fmt } from "../lib/format";
import { AKRON_STAND_IN_FIELD, AKRON_TRIAL, type AkronComparison, compareToAkron } from "./akron";

const score = (v: number) => v.toFixed(2);

function Result({ comparison }: { comparison: AkronComparison }) {
  const favoredName =
    comparison.productFavors === "wheat_millet" ? AKRON_TRIAL.rotationB : AKRON_TRIAL.rotationA;
  const favoredScore =
    comparison.productFavors === "wheat_millet"
      ? comparison.wheatMilletMedian
      : comparison.wheatFallowMedian;
  const otherScore =
    comparison.productFavors === "wheat_millet"
      ? comparison.wheatFallowMedian
      : comparison.wheatMilletMedian;
  return (
    <Card className="space-y-2">
      <Badge tone={comparison.agrees ? "good" : "warn"}>
        {comparison.agrees ? t("validation.akron.agrees") : t("validation.akron.disagrees")}
      </Badge>
      <p className="text-body text-ink">
        {fmt(t("validation.akron.productRanking"), {
          favored: favoredName,
          favoredScore: score(favoredScore),
          otherScore: score(otherScore),
        })}
      </p>
    </Card>
  );
}

/** Ranking check (F-22): this product's replay next to the Akron trial's reported direction. */
export function AkronCheck() {
  const geometry = AKRON_STAND_IN_FIELD?.geometry;
  const { bundle, isComplete, error } = useFieldBundle(geometry);
  const comparison = useMemo(() => {
    if (!bundle || !isComplete) return null;
    try {
      return compareToAkron(bundle);
    } catch {
      return "error" as const;
    }
  }, [bundle, isComplete]);
  const replayFailed = comparison === "error";
  const result = replayFailed ? null : comparison;

  return (
    <section className="space-y-3">
      <h2 className="text-title font-semibold text-ink">{t("validation.akron.title")}</h2>
      <p className="text-body text-ink-muted">{t("validation.akron.intro")}</p>
      <Card className="space-y-1">
        <p className="text-body font-semibold text-ink">{AKRON_TRIAL.name}</p>
        <p className="text-caption text-ink-muted">
          {fmt(t("validation.akron.trialLocation"), { location: AKRON_TRIAL.location })}
        </p>
        <p className="text-caption text-ink-muted">
          {fmt(t("validation.akron.trialPeriod"), { period: AKRON_TRIAL.period })}
        </p>
        <p className="text-caption text-ink-muted">
          {fmt(t("validation.akron.trialRotations"), {
            a: AKRON_TRIAL.rotationA,
            b: AKRON_TRIAL.rotationB,
          })}
        </p>
        <p className="text-body text-ink">
          {fmt(t("validation.akron.trialFinding"), { finding: AKRON_TRIAL.finding })}
        </p>
        <a
          href={AKRON_TRIAL.citationUrl}
          target="_blank"
          rel="noreferrer"
          className="text-caption text-accent-strong underline"
        >
          {t("validation.akron.citation")}
        </a>
      </Card>
      {error || replayFailed ? (
        <p role="alert" className="text-body text-risk-ink">
          {t("validation.akron.error")}
        </p>
      ) : result ? (
        <Result comparison={result} />
      ) : (
        <div role="status" className="space-y-1">
          <p className="text-caption text-ink-muted">{t("validation.akron.loading")}</p>
          <Skeleton className="h-24" />
        </div>
      )}
      <p className="text-caption text-ink-muted">{t("validation.akron.standInNotice")}</p>
      <p className="text-caption text-ink-muted">{t("validation.akron.directional")}</p>
    </section>
  );
}
