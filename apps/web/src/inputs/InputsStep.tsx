import { Button, Disclosure, Skeleton } from "@itza/ui-kit";
import { useMemo } from "react";
import { PrioritySliders } from "../compare/sliders";
import { t } from "../copy";
import { useFieldBundle } from "../data";
import { useSettled } from "../lib/useSettled";
import { useFieldMemory } from "../memory/useFieldMemory";
import { useFieldStore } from "../state";
import { acceptDefaults } from "./actions";
import { ConstraintsForm } from "./ConstraintsForm";
import { RotationEditor } from "./RotationEditor";
import { rotationProposal } from "./rotation";
import { SoilForm } from "./SoilForm";
import { type ShownSoil, SOIL_FIELDS, type SoilKey, shownSoil } from "./soil";
import { useReadiness } from "./useReadiness";

const SETTLE_MS = 800;

function Check({ done, children }: { done: boolean; children: string }) {
  return (
    <li className="flex items-start gap-2 text-body text-ink">
      <span aria-hidden="true" className={done ? "text-good-ink" : "text-warn-ink"}>
        {done ? "✓" : "!"}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** The inputs step (F-05): rotation, soil, priorities and constraints, and whether the comparison may run. */
export function InputsStep() {
  const { region, result } = useFieldMemory();
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle } = useFieldBundle(geometry);
  const inputs = useFieldStore((s) => s.inputs);
  const history = useFieldStore((s) => s.confirmedHistory);
  const readiness = useReadiness();

  const proposal = useMemo(
    () => rotationProposal(inputs, history, result?.rotation.crops ?? []),
    [inputs, history, result],
  );

  if (!region) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!bundle && !readiness.accepted && readiness.checking) {
    return (
      <p role="status" className="text-body text-ink-muted">
        {t("inputs.loading")}
      </p>
    );
  }

  const shown = Object.fromEntries(
    SOIL_FIELDS.map((f) => [f.key, shownSoil(f.key, bundle?.soil, inputs.soil)]),
  ) as Record<SoilKey, ShownSoil>;

  return (
    <div className="space-y-4">
      <section aria-labelledby="inputs-status" className="space-y-2">
        <h2 id="inputs-status" className="sr-only">
          {t("inputs.status.title")}
        </h2>
        {readiness.ready ? (
          <p role="status" className="flex items-center gap-2 text-body font-medium text-good-ink">
            <span aria-hidden="true">✓</span>
            {t(readiness.accepted ? "inputs.status.ready.defaults" : "inputs.status.ready")}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-warn-ink/40 bg-warn-soft px-4 py-3">
            <ul className="space-y-1">
              <Check done={readiness.rotationSet}>
                {t(
                  readiness.rotationSet
                    ? "inputs.status.rotation.set"
                    : "inputs.status.rotation.default",
                )}
              </Check>
              <Check done={readiness.soilSet}>
                {t(readiness.soilSet ? "inputs.status.soil.set" : "inputs.status.soil.default")}
              </Check>
            </ul>
            <Button type="button" size="sm" onClick={() => acceptDefaults(proposal.crops, shown)}>
              {t("inputs.status.accept")}
            </Button>
          </div>
        )}
      </section>

      <RotationEditor crops={proposal.crops} source={proposal.source} pack={region.pack} />
      <SoilForm bundleSoil={bundle?.soil} overrides={inputs.soil} />

      <Disclosure summary={t("sliders.priorities.title")}>
        <PrioritySliders hideLegend />
      </Disclosure>

      <ConstraintsForm constraints={inputs.constraints} pack={region.pack} />
    </div>
  );
}
