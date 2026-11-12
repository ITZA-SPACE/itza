import { EmptyState } from "@itza/ui-kit";
import { t } from "../../copy";

/**
 * DEMO_STRATEGY.md §3, 2:15–2:35: "same dilemma, two continents" — history vs the USDA crop map and
 * ranking vs the Akron trial, on a real US Great Plains proof field.
 *
 * Gracefully skipped: there is no real proof-field hero bundle yet (pending #17), and #39's
 * validation view (built on synthetic placeholder ground truth until #17 ships) had not merged into
 * `dev` when this step was written. Wire this step to the real `/validation` route once both land.
 */
export function ValidationStep() {
  return (
    <div className="p-3">
      <EmptyState
        title={t("demo.step.validation.title")}
        description={t("demo.step.validation.body")}
      />
    </div>
  );
}
