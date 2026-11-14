import { lazy, Suspense } from "react";
import { t } from "../../copy";

const ArenaStep = lazy(() => import("../../arena").then((m) => ({ default: m.ArenaStep })));
const ZonesPanel = lazy(() =>
  import("../../zones/ZonesPanel").then((m) => ({ default: m.ZonesPanel })),
);
const NisarPanel = lazy(() =>
  import("../../context/ContextPanel").then((m) => ({ default: m.NisarPanel })),
);

/**
 * DEMO_STRATEGY.md §3, 2:35–2:45: back on the story field — Model Arena agreement, zones and the
 * NISAR snapshot.
 */
export function ArenaZonesStep() {
  return (
    <div className="space-y-3 p-3">
      <p className="text-caption text-ink-muted">{t("demo.step.arena.note")}</p>
      <Suspense fallback={null}>
        <ArenaStep />
        <ZonesPanel />
        <NisarPanel />
      </Suspense>
    </div>
  );
}
