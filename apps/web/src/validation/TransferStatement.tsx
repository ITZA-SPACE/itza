import { Card } from "@itza/ui-kit";
import { t } from "../copy";

/** Transfer statement (F-22): what the proof field proves, and what it does not, for a farmer's own field. */
export function TransferStatement() {
  return (
    <Card className="space-y-1">
      <h2 className="text-title font-semibold text-ink">{t("validation.transfer.title")}</h2>
      <p className="text-body text-ink-muted">{t("validation.transfer.body")}</p>
    </Card>
  );
}
