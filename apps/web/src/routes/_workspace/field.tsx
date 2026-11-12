import { Button } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { t } from "../../copy";
import { useFieldStore } from "../../state";

const LayerPanel = lazy(() =>
  import("../../map/layers/LayerPanel").then((m) => ({ default: m.LayerPanel })),
);

function FieldStep() {
  const hasField = useFieldStore((s) => s.field !== null);
  return (
    <FlowStepPage step="field">
      {hasField ? (
        <>
          <Suspense fallback={null}>
            <LayerPanel />
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
