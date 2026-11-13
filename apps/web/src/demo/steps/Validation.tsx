import { ValidationStep as ValidationView } from "../../validation";

/**
 * DEMO_STRATEGY.md §3, 2:15–2:35: "same dilemma, two continents" — history vs the USDA crop map and
 * ranking vs the Akron trial. Shows #39's validation view, which reads the three real Akron proof
 * fields and reports its results as measured, including where they miss the target.
 */
export function ValidationStep() {
  return (
    <div className="p-3">
      <ValidationView />
    </div>
  );
}
