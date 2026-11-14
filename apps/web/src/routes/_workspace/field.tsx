import { Button } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
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

function FieldStep() {
  const hasField = useFieldStore((s) => s.field !== null);
  return (
    <FlowStepPage step="field">
      <HeroFieldPicker />
      {hasField ? (
        <>
          <Suspense fallback={null}>
            <LayerPanel />
            <ZonesPanel />
            <NisarPanel />
            <ContextCards />
          </Suspense>
          <Button asChild variant="secondary">
            <Link to="/twin">{t("twin.open")}</Link>
          </Button>
        </>
      ) : null}
    </FlowStepPage>
  );
}

export const Route = createFileRoute("/_workspace/field")({ component: FieldStep });
