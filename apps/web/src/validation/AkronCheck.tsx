import type { FieldBundle } from "@itza/engine/contracts";
import { Badge, Card } from "@itza/ui-kit";
import { useMemo } from "react";
import { t } from "../copy";
import type { HeroField } from "../data";
import { fmt } from "../lib/format";
import { AKRON_TRIAL, type AkronComparison, compareToAkron } from "./akron";

const score = (v: number) => v.toFixed(2);

function Result({ name, comparison }: { name: string; comparison: AkronComparison }) {
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
      <h3 className="text-body font-semibold text-ink">{name}</h3>
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
      {comparison.agrees ? null : (
        <p className="text-caption text-ink-muted">{t("validation.akron.disagreeReason")}</p>
      )}
    </Card>
  );
}

type Fields = readonly { hero: HeroField; bundle: FieldBundle }[];

/** Ranking check (F-22): this product's replay next to the Akron trial's reported direction. */
export function AkronCheck({
  fields,
  nameOf,
}: {
  fields: Fields;
  nameOf: (h: HeroField) => string;
}) {
  const results = useMemo(
    () =>
      fields.map(({ hero, bundle }) => {
        try {
          return { hero, comparison: compareToAkron(bundle) };
        } catch {
          return { hero, comparison: null };
        }
      }),
    [fields],
  );
  const failed = results.some((r) => r.comparison === null);
  const agreeing = results.filter((r) => r.comparison?.agrees).length;

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
      {failed ? (
        <p role="alert" className="text-body text-risk-ink">
          {t("validation.akron.error")}
        </p>
      ) : (
        <>
          <p className="text-body font-medium text-ink">
            {fmt(t("validation.akron.summary"), { agree: agreeing, total: results.length })}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {results.map(({ hero, comparison }) =>
              comparison ? (
                <Result key={hero.id} name={nameOf(hero)} comparison={comparison} />
              ) : null,
            )}
          </div>
        </>
      )}
      <p className="text-caption text-ink-muted">{t("validation.akron.directional")}</p>
    </section>
  );
}
