import { FieldTwin } from "../../twin/FieldTwin";
import { ValidationStep as ValidationView } from "../../validation";
import { proofField } from "../constants";

/**
 * DEMO_STRATEGY.md §3, 2:15–2:35: "same dilemma, two continents". The 3D view of the Akron proof
 * field, then the history check against the USDA crop map, reported as measured, including where it
 * misses the target.
 */
export function ValidationStep() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <FieldTwin geometry={proofField().geometry} />
      <ValidationView compact />
    </div>
  );
}
