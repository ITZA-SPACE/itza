import { ValidationStep as ValidationView } from "../../validation";

/**
 * DEMO_STRATEGY.md §3, 2:15–2:35: "same dilemma, two continents" — history vs the USDA crop map and
 * ranking vs the Akron trial. Shows #39's validation view, which labels its synthetic placeholder
 * data until #17 ships the real US Great Plains proof-field bundle.
 */
export function ValidationStep() {
  return (
    <div className="p-3">
      <ValidationView />
    </div>
  );
}
