import { lazy, Suspense } from "react";

const ArenaStep = lazy(() => import("../../arena").then((m) => ({ default: m.ArenaStep })));

/**
 * DEMO_STRATEGY.md §3, 2:35–2:45: back on the story field. The three methods' agreement and their
 * opinions on the hardest season; zones and the NISAR snapshot stay on the map page.
 */
export function ArenaZonesStep() {
  return (
    <Suspense fallback={null}>
      <ArenaStep compact />
    </Suspense>
  );
}
