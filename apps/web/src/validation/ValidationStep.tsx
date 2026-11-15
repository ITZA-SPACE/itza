import { cn, Disclosure, Skeleton } from "@itza/ui-kit";
import { useMemo } from "react";
import { hasCopy, t } from "../copy";
import type { HeroField } from "../data";
import { fmt } from "../lib/format";
import { AkronCheck } from "./AkronCheck";
import { compareToAkron } from "./akron";
import { CrossChecks } from "./CrossChecks";
import { summarizeConfusion } from "./groundTruth";
import { AGREEMENT_TARGET, HistoryCheck, SeasonStrip } from "./HistoryCheck";
import { TransferStatement } from "./TransferStatement";
import { useProofData } from "./useProofData";

/** A proof field's plain-English name, falling back to its id. */
function nameOf(hero: HeroField): string {
  const key = `hero.name.${hero.id}`;
  return hasCopy(key) ? t(key) : hero.id;
}

function Big({ value, label, good }: { value: string; label: string; good: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "font-display text-[3.5rem] leading-none font-bold tabular-nums",
          good ? "text-leaf" : "text-harvest",
        )}
      >
        {value}
      </span>
      <span className="text-caption text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * The validation view (F-22), the only place it lives: two numbers (seasons that match public crop
 * maps, proof fields where the ranking agrees with the published trial), one tick strip per proof
 * field, and every table, cross-check and caveat behind "All the evidence".
 */
export function ValidationStep({ compact = false }: { compact?: boolean } = {}) {
  const proof = useProofData(nameOf);
  const trial = useMemo(() => {
    const results = proof.bundles.map(({ bundle }) => {
      try {
        return compareToAkron(bundle).agrees;
      } catch {
        return null;
      }
    });
    return { agree: results.filter((r) => r === true).length, total: results.length };
  }, [proof.bundles]);

  if (proof.status === "error") {
    return (
      <p role="alert" className="text-body text-risk-ink">
        {t("validation.loadError")}
      </p>
    );
  }
  if (proof.status === "loading") return <Skeleton className="h-48" />;

  const summary = summarizeConfusion(proof.histories);
  const percent = Math.round(summary.agreement * 100);
  return (
    <section className="glass-panel space-y-5 rounded-card p-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Big
          value={`${percent}%`}
          good={summary.agreement >= AGREEMENT_TARGET}
          label={fmt(t("validation.big.history"), {
            target: Math.round(AGREEMENT_TARGET * 100),
          })}
        />
        <Big
          value={`${trial.agree}/${trial.total}`}
          good={trial.agree * 2 > trial.total}
          label={t("validation.big.trial")}
        />
      </div>
      <ul className="grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
        {proof.histories.map((field) => {
          const agree = field.seasons.filter((s) => s.inferredClass === s.groundTruthClass).length;
          return (
            <li key={field.id} className="space-y-2">
              <p className="flex items-baseline justify-between gap-2 text-caption">
                <span className="font-semibold text-ink">{field.name}</span>
                <span className="text-ink-muted tabular-nums">
                  {agree}/{field.seasons.length}
                </span>
              </p>
              <SeasonStrip field={field} />
            </li>
          );
        })}
      </ul>
      {compact ? null : (
        <Disclosure summary={t("validation.evidence")}>
          <div className="space-y-6 pt-2">
            <p className="text-caption text-ink-muted">
              {t("validation.sources.body")} {t("validation.sources.caveat")}
            </p>
            <HistoryCheck fields={proof.histories} detail />
            <AkronCheck fields={proof.bundles} nameOf={nameOf} />
            <section className="space-y-3">
              <h3 className="text-body font-semibold text-ink">{t("validation.cross.title")}</h3>
              <CrossChecks />
            </section>
            <TransferStatement />
          </div>
        </Disclosure>
      )}
    </section>
  );
}
