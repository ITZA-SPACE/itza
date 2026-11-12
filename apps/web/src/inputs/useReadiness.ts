import { useFieldBundle } from "../data";
import { useSettled } from "../lib/useSettled";
import { useFieldStore } from "../state";
import { rotationIsSet } from "./rotation";
import { soilIsSet } from "./soil";

const SETTLE_MS = 800;

export interface Readiness {
  rotationSet: boolean;
  soilSet: boolean;
  /** The farmer accepted the defaults shown for what is not set. */
  accepted: boolean;
  /** The comparison may run: rotation and soil are set, or the defaults were accepted. */
  ready: boolean;
  /** The soil from the satellites has not finished loading, so "soil set" is not known yet. */
  checking: boolean;
}

/** Whether the comparison may run on this field's inputs (F-05: no analysis with unset rotation or soil). */
export function useReadiness(): Readiness {
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle, isComplete } = useFieldBundle(geometry);
  const inputs = useFieldStore((s) => s.inputs);
  const history = useFieldStore((s) => s.confirmedHistory);
  const rotationSet = rotationIsSet(inputs, history);
  const soilSet = soilIsSet(bundle?.soil, inputs.soil);
  const accepted = inputs.acceptedDefaults === true;
  return {
    rotationSet,
    soilSet,
    accepted,
    ready: accepted || (rotationSet && soilSet),
    checking: !accepted && !isComplete,
  };
}
