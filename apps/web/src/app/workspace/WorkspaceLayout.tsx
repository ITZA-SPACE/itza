import { cn } from "@itza/ui-kit";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { t } from "../../copy";
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
  return (
    <div className={mapPage ? "flex h-full min-h-0 gap-4 px-4 pt-2 pb-4" : undefined}>
      <div
        className={
          mapPage
            ? "relative min-h-0 flex-1 overflow-hidden rounded-card border border-rim-strong bg-night shadow-glass"
            : "hidden"
        }
      >
        <Suspense fallback={<p className="p-4 text-body text-ink-muted">{t("map.loading")}</p>}>
          <MapView />
        </Suspense>
      </div>
      {mapPage ? (
        <aside
          id="panel"
          aria-label={t("workspace.panel")}
          className="fixed inset-x-0 bottom-0 z-20 flex max-h-[70dvh] flex-col rounded-t-card border border-rim-strong bg-surface/95 shadow-glass backdrop-blur-md lg:static lg:z-auto lg:max-h-none lg:w-[26rem] lg:shrink-0 lg:rounded-card lg:bg-panel"
        >
          <button
            type="button"
            aria-expanded={raised}
            aria-controls="panel-content"
            onClick={() => setRaised((r) => !r)}
            className="flex min-h-12 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-t-card pt-2 pb-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus lg:hidden"
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
