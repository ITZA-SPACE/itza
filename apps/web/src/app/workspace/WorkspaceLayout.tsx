import { Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { t } from "../../copy";
import { useMediaQuery } from "../useMediaQuery";
import { FlowNav } from "./FlowNav";

// MapLibre and Terra Draw are the heaviest code in the app: they load only with the workspace.
const MapView = lazy(() => import("../../map/MapView"));

/**
 * The map workspace: the map stays mounted while the route in the panel changes. On a wide screen the
 * panel is a side column; on a phone it is a bottom sheet that the farmer raises and lowers.
 */
export function WorkspaceLayout() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [raised, setRaised] = useState(false);
  const collapsed = !desktop && !raised;
  return (
    <div className="relative flex h-full min-h-0 flex-col lg:flex-row-reverse">
      <div className="relative min-h-0 flex-1 bg-surface-muted">
        <Suspense fallback={<p className="p-4 text-body text-ink-muted">{t("map.loading")}</p>}>
          <MapView />
        </Suspense>
      </div>
      <aside
        id="panel"
        aria-label={t("workspace.panel")}
        className="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-card border-t border-line-soft bg-surface shadow-lg lg:static lg:z-auto lg:w-96 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none"
      >
        <button
          type="button"
          aria-expanded={raised}
          aria-controls="panel-content"
          onClick={() => setRaised((r) => !r)}
          className="flex min-h-11 w-full items-center justify-center lg:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-line" />
          <span className="sr-only">
            {raised ? t("workspace.sheet.collapse") : t("workspace.sheet.expand")}
          </span>
        </button>
        <div className="px-3 pb-2 lg:pt-3">
          <FlowNav />
        </div>
        <div
          id="panel-content"
          inert={collapsed}
          className={`overflow-y-auto px-4 pb-4 pt-2 ${collapsed ? "max-h-0 overflow-hidden py-0" : "max-h-[60dvh] lg:max-h-none"} lg:flex-1`}
        >
          <Outlet />
        </div>
      </aside>
    </div>
  );
}
