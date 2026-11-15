import { Disclosure } from "@itza/ui-kit";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { FieldSummary } from "../../app/workspace/FieldSummary";
import { t } from "../../copy";
import { HeroFieldPicker } from "../../data/HeroFieldPicker";
import { useFieldStore } from "../../state";

const LayerPanel = lazy(() =>
  import("../../map/layers/LayerPanel").then((m) => ({ default: m.LayerPanel })),
);

const NisarPanel = lazy(() =>
  import("../../context/ContextPanel").then((m) => ({ default: m.NisarPanel })),
);

const ContextCards = lazy(() =>
  import("../../context/ContextPanel").then((m) => ({ default: m.ContextCards })),
);

const ZonesPanel = lazy(() =>
  import("../../zones/ZonesPanel").then((m) => ({ default: m.ZonesPanel })),
);

/**
 * The first screen: the map and one small card. Without a field the card offers the demo fields;
 * with one it shows the field in two numbers and Next. Layers, zones and satellite context are one
 * fold away, never in the way.
 */
function FieldStep() {
  const hasField = useFieldStore((s) => s.field !== null);
  if (!hasField) return <HeroFieldPicker />;
  return (
    <div className="space-y-3">
      <FieldSummary />
      <Disclosure summary={t("field.details")}>
        <div className="space-y-5">
          <Suspense fallback={null}>
            <LayerPanel />
            <ZonesPanel />
            <NisarPanel />
            <ContextCards />
          </Suspense>
        </div>
      </Disclosure>
    </div>
  );
}

export const Route = createFileRoute("/_workspace/field")({ component: FieldStep });
