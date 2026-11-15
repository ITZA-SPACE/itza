import { Dialog, TooltipProvider } from "@itza/ui-kit";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import wordmark from "../assets/itza-wordmark.svg";
import { AssistantHost } from "../assistant";
import { t } from "../copy";
import { OfflineIndicator, UpdateToast } from "../pwa";
import { ValidationMethodsTab } from "../validation";
import { BottomNav } from "./shell/BottomNav";
import { FieldSwitcher } from "./shell/FieldSwitcher";
import { MoreMenu } from "./shell/MoreMenu";
import { Sidebar } from "./shell/Sidebar";

const COLLAPSED_KEY = "itza.sidebar.collapsed";

/** The sidebar's collapsed state, remembered per browser; storage may be unavailable. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

/**
 * The app frame from the Figma web dashboard: a glass sidebar on the left on wide screens, a top bar
 * with the field switcher and the tools, and the page under it, all over the night-sky backdrop. On
 * phones and tablets (mobile first) the sidebar gives way to a bottom bar within thumb reach, and
 * "More" opens every page as a bottom sheet.
 */
export function RootLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () =>
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A route change from anywhere (a link in a page, the assistant) closes the phone menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing is the reaction to the path changing.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <TooltipProvider>
      <div className="space-backdrop flex h-dvh text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface focus:p-3 focus:shadow-float"
        >
          {t("app.skip")}
        </a>
        <aside
          className={`hidden shrink-0 py-4 pl-4 transition-[width] duration-200 lg:block ${collapsed ? "w-[5.5rem]" : "w-64"}`}
        >
          <div className="glass-sidebar h-full overflow-y-auto rounded-card">
            <Sidebar collapsed={collapsed} onToggle={toggle} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:gap-3 lg:pt-4">
            <Link
              to="/"
              aria-label={t("nav.brand")}
              className="shrink-0 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
            >
              <img src={wordmark} alt="" width={70} height={20} className="h-5 w-[70px]" />
            </Link>
            <div className="flex min-w-0 flex-1">
              <FieldSwitcher />
            </div>
            <OfflineIndicator />
          </header>
          <main
            id="main"
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0"
          >
            <Outlet />
          </main>
        </div>
        <BottomNav onMore={() => setMenuOpen(true)} moreOpen={menuOpen} />
        <Dialog
          open={menuOpen}
          onOpenChange={setMenuOpen}
          variant="sheet"
          title={t("nav.menu.title")}
          closeLabel={t("nav.menu.close")}
        >
          <MoreMenu onNavigate={() => setMenuOpen(false)} />
        </Dialog>
        <ValidationMethodsTab />
        <AssistantHost />
        <UpdateToast />
      </div>
    </TooltipProvider>
  );
}
