import { Button, Disclosure } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { FieldSummary } from "../../app/workspace/FieldSummary";
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
      {hasField ? (
        <>
          <FieldSummary />
          <div className="space-y-1">
            <Button asChild className="w-full">
              <Link to="/twin">{t("twin.render")}</Link>
            </Button>
            <p className="text-caption text-ink-muted">{t("twin.render.hint")}</p>
          </div>
          <Suspense fallback={null}>
            <LayerPanel />
            <ZonesPanel />
            <Disclosure summary={t("context.group")} count={4}>
              <NisarPanel />
              <ContextCards />
            </Disclosure>
          </Suspense>
        </>
      ) : (
        <HeroFieldPicker />
      )}
    </FlowStepPage>
  );
}

export const Route = createFileRoute("/_workspace/field")({ component: FieldStep });
