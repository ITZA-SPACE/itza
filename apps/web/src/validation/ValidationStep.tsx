import { Card, Skeleton } from "@itza/ui-kit";
import { hasCopy, t } from "../copy";
import type { HeroField } from "../data";
import { AkronCheck } from "./AkronCheck";
import { CrossChecks } from "./CrossChecks";
import { HistoryCheck } from "./HistoryCheck";
import { TransferStatement } from "./TransferStatement";
import { useProofData } from "./useProofData";

/** A proof field's plain-English name, falling back to its id. */
function nameOf(hero: HeroField): string {
  const key = `hero.name.${hero.id}`;
  return hasCopy(key) ? t(key) : hero.id;
}

/** The full validation view (F-22): history check, ranking check and the transfer statement. */
export function ValidationStep() {
  const proof = useProofData(nameOf);
  return (
    <div className="space-y-6">
      <Card className="space-y-1">
        <p className="m-0 text-body text-ink">{t("validation.sources.body")}</p>
        <p className="m-0 text-caption text-ink-muted">{t("validation.sources.caveat")}</p>
      </Card>
      {proof.status === "error" ? (
        <p role="alert" className="text-body text-risk-ink">
          {t("validation.loadError")}
        </p>
      ) : proof.status === "loading" ? (
        <div role="status" className="space-y-2">
          <p className="m-0 text-caption text-ink-muted">{t("validation.loading")}</p>
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <HistoryCheck fields={proof.histories} />
          <AkronCheck fields={proof.bundles} nameOf={nameOf} />
        </>
      )}
      <CrossChecks />
      <TransferStatement />
    </div>
  );
}
