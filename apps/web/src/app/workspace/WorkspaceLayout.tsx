import { cn, focusRing } from "@itza/ui-kit";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Box, Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { t } from "../../copy";
import { useFieldStore } from "../../state";
import { MapFrame3D } from "../../twin/MapFrame3D";
import { PageContainer } from "../PageContainer";
import { useMediaQuery } from "../useMediaQuery";

// MapLibre and Terra Draw are the heaviest code in the app: they load only with the workspace.
const MapView = lazy(() => import("../../map/MapView"));

/**
 * The field workspace. The map page shows the map in a glass frame with the field panel beside it
 * (a bottom sheet on phones). Every other page gets the whole width; the map stays mounted, hidden,
 * so the drawn field, layers and camera are where the farmer left them on the way back.
 */
export function WorkspaceLayout() {
  const mapPage = useRouterState({ select: (state) => state.location.pathname === "/field" });
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [raised, setRaised] = useState(false);
  const collapsed = mapPage && !desktop && !raised;
  const geometry = useFieldStore((s) => s.field?.geometry ?? null);
  const [threeD, setThreeD] = useState(false);
  // No field, no 3D: deleting the field returns the frame to the map.
  useEffect(() => {
    if (!geometry) setThreeD(false);
  }, [geometry]);
  const showThreeD = threeD && geometry !== null;
  return (
    <div className={mapPage ? "flex h-full min-h-0 gap-4 px-4 pt-2 pb-4" : undefined}>
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
            <fieldset className="absolute top-3 left-1/2 z-30 m-0 flex -translate-x-1/2 items-center gap-1 rounded-full border border-rim-strong bg-surface/85 p-1 shadow-float backdrop-blur-md">
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
          className="fixed inset-x-3 bottom-[calc(5.25rem+max(0.75rem,env(safe-area-inset-bottom)))] z-20 flex max-h-[60dvh] flex-col rounded-card border border-rim-strong bg-surface/95 shadow-float backdrop-blur-md lg:static lg:border-rim-card lg:shadow-glass-card lg:z-auto lg:max-h-none lg:w-[26rem] lg:shrink-0 lg:bg-panel"
        >
          <button
            type="button"
            aria-expanded={raised}
            aria-controls="panel-content"
            onClick={() => setRaised((r) => !r)}
            className="flex min-h-12 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-card pt-2 pb-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus lg:hidden"
          >
            <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-rim-strong" />
            <span className="text-caption font-semibold text-ink-muted">
              {raised ? t("workspace.sheet.collapse") : t("workspace.sheet.expand")}
            </span>
          </button>
          <div
            id="panel-content"
            inert={collapsed}
            className={cn(
              "min-h-0 overflow-y-auto px-5 lg:flex-1 lg:py-5",
              collapsed ? "max-h-0 overflow-hidden" : "pb-5",
            )}
          >
            <Outlet />
          </div>
        </aside>
      ) : (
        <PageContainer>
          <Outlet />
        </PageContainer>
      )}
    </div>
  );
}
