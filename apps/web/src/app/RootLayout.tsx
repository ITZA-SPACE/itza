import { Dialog, TooltipProvider } from "@itza/ui-kit";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import wordmark from "../assets/itza-wordmark.svg";
import { AssistantButton, AssistantHost } from "../assistant";
import { t } from "../copy";
import { MethodsButton, MethodsDrawer } from "../methods";
import { OfflineIndicator, UpdateToast } from "../pwa";
import { ValidationMethodsTab } from "../validation";
import { BottomNav } from "./shell/BottomNav";
import { FieldSwitcher } from "./shell/FieldSwitcher";
import { MoreMenu } from "./shell/MoreMenu";
import { Sidebar } from "./shell/Sidebar";

/**
 * The app frame from the Figma web dashboard: a glass sidebar on the left on wide screens, a top bar
 * with the field switcher and the tools, and the page under it, all over the night-sky backdrop. On
 * phones and tablets (mobile first) the sidebar gives way to a bottom bar within thumb reach, and
 * "More" opens every page as a bottom sheet.
 */
export function RootLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
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
        <aside className="hidden w-64 shrink-0 py-4 pl-4 lg:block">
          <div className="glass-panel h-full overflow-y-auto rounded-card">
            <Sidebar />
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
            <MethodsButton />
            {/* Phones and tablets reach Ask ITZA from the bottom bar. */}
            <div className="hidden lg:contents">
              <AssistantButton />
            </div>
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
        <MethodsDrawer />
        <ValidationMethodsTab />
        <AssistantHost />
        <UpdateToast />
      </div>
    </TooltipProvider>
  );
}
