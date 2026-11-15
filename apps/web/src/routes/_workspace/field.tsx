import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useState } from "react";
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
 * with one it shows the field in two numbers, Next, and a row of layer icons. Zones and satellite
 * context load only when asked for, so nothing is painted over the land by default.
 */
function FieldStep() {
  const hasField = useFieldStore((s) => s.field !== null);
  const [more, setMore] = useState(false);
  if (!hasField) return <HeroFieldPicker />;
  return (
    <div className="space-y-3">
      <FieldSummary />
      <Suspense fallback={null}>
        <LayerPanel />
      </Suspense>
      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((m) => !m)}
        className="flex min-h-9 w-full items-center justify-between rounded-control text-caption font-semibold text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        {t("field.details")}
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${more ? "rotate-180" : ""}`}
        />
      </button>
      {more ? (
        <div className="space-y-5">
          <Suspense fallback={null}>
            <ZonesPanel />
            <NisarPanel />
            <ContextCards />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_workspace/field")({ component: FieldStep });
