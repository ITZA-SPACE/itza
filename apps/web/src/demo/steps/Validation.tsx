import { FieldTwin } from "../../twin/FieldTwin";
import { ValidationStep as ValidationView } from "../../validation";
import { proofField } from "../constants";

/**
 * DEMO_STRATEGY.md §3, 2:15–2:35: "same dilemma, two continents". The 3D view flies to the Akron
 * proof field, then the validation view shows history vs the USDA crop map and ranking vs the Akron
 * trial, reading the real proof fields and reporting its results as measured, including where they
 * miss the target.
 */
export function ValidationStep() {
  return (
    <div className="space-y-3 p-3">
      <div className="h-72">
        <FieldTwin geometry={proofField().geometry} />
      </div>
      <ValidationView />
    </div>
  );
}
