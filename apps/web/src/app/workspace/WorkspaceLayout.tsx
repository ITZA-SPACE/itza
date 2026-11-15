import { cn, focusRing } from "@itza/ui-kit";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Box, Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { t } from "../../copy";
import { useFieldStore } from "../../state";
import { MapFrame3D } from "../../twin/MapFrame3D";
import { PageContainer } from "../PageContainer";

// MapLibre and Terra Draw are the heaviest code in the app: they load only with the workspace.
const MapView = lazy(() => import("../../map/MapView"));

/**
 * The field workspace. The map page is the map alone in a glass frame, with one small floating card
 * for the field and the way forward (a bottom card on phones). Every other page gets the whole width; the map stays mounted, hidden,
 * so the drawn field, layers and camera are where the farmer left them on the way back.
 */
export function WorkspaceLayout() {
  const mapPage = useRouterState({ select: (state) => state.location.pathname === "/field" });
  const geometry = useFieldStore((s) => s.field?.geometry ?? null);
  const [threeD, setThreeD] = useState(false);
  // No field, no 3D: deleting the field returns the frame to the map.
  useEffect(() => {
    if (!geometry) setThreeD(false);
  }, [geometry]);
  const showThreeD = threeD && geometry !== null;
  return (
    <div className={mapPage ? "relative flex h-full min-h-0 px-4 pt-2 pb-4" : undefined}>
      <div
        className={
          mapPage
            ? "workspace-map relative min-h-0 flex-1 overflow-hidden rounded-card border border-rim-card bg-night shadow-glass-card"
            : "hidden"
        }
      >
        <Suspense fallback={<p className="p-4 text-body text-ink-muted">{t("map.loading")}</p>}>
          <MapView />
        </Suspense>
        {mapPage && geometry ? (
          <>
            {showThreeD ? (
              <div className="absolute inset-0 z-20 bg-night">
                <MapFrame3D geometry={geometry} />
              </div>
            ) : null}
            <fieldset
              data-view-toggle
              className="absolute top-3 left-1/2 z-30 m-0 flex -translate-x-1/2 items-center gap-1 rounded-full border border-rim-strong bg-surface/85 p-1 shadow-float backdrop-blur-md"
            >
              <legend className="sr-only">{t("workspace.view")}</legend>
              <button
                type="button"
                aria-pressed={!showThreeD}
                onClick={() => setThreeD(false)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-body font-semibold",
                  showThreeD ? "text-ink-muted" : "bg-aurora text-night",
                  focusRing,
                )}
              >
                <MapIcon aria-hidden className="size-4" />
                {t("workspace.view.map")}
              </button>
              <button
                type="button"
                aria-pressed={showThreeD}
                onClick={() => setThreeD(true)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-body font-semibold",
                  showThreeD ? "bg-aurora text-night" : "text-ink",
                  focusRing,
                )}
              >
                <Box aria-hidden className="size-4" />
                {t("workspace.view.3d")}
              </button>
            </fieldset>
          </>
        ) : null}
      </div>
      {mapPage ? (
        <aside
          id="panel"
          aria-label={t("workspace.panel")}
          className="fixed inset-x-3 bottom-[calc(5.25rem+max(0.75rem,env(safe-area-inset-bottom)))] z-20 max-h-[40dvh] overflow-y-auto rounded-card border border-rim-strong bg-surface/90 p-3 lg:p-4 shadow-float backdrop-blur-md lg:absolute lg:inset-x-auto lg:bottom-8 lg:left-8 lg:max-h-[calc(100%-9rem)] lg:w-[21rem]"
        >
          <Outlet />
        </aside>
      ) : (
        <PageContainer>
          <Outlet />
        </PageContainer>
      )}
    </div>
  );
}
