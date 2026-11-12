import { Badge } from "@itza/ui-kit";
import { t } from "../copy";
import { AkronCheck } from "./AkronCheck";
import { HistoryCheck } from "./HistoryCheck";
import { TransferStatement } from "./TransferStatement";

/** The full validation view (F-22): history check, ranking check and the transfer statement. */
export function ValidationStep() {
  return (
    <div className="space-y-6">
      <div role="status" className="flex items-start gap-2 rounded-control bg-warn-soft p-3">
        <Badge tone="warn" aria-hidden="true">
          !
        </Badge>
        <p className="text-body text-warn-ink">{t("validation.placeholderNotice")}</p>
      </div>
      <HistoryCheck />
      <AkronCheck />
      <TransferStatement />
    </div>
  );
}
