import { Dialog, IconButton, TooltipProvider } from "@itza/ui-kit";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import wordmark from "../assets/itza-wordmark.svg";
import { AssistantButton, AssistantHost } from "../assistant";
import { t } from "../copy";
import { MethodsButton, MethodsDrawer } from "../methods";
import { OfflineIndicator, UpdateToast } from "../pwa";
import { ValidationMethodsTab } from "../validation";
import { FieldSwitcher } from "./shell/FieldSwitcher";
import { Sidebar } from "./shell/Sidebar";

/**
 * The app frame from the Figma web dashboard: a glass sidebar on the left (a drawer on phones and
 * tablets), a top bar with the field switcher and the tools, and the page under it, all over the
 * night-sky backdrop.
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
          <header className="flex items-center gap-2 px-4 pt-3 pb-2 sm:gap-3 lg:pt-4">
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
            <AssistantButton />
            <IconButton
              label={t("nav.menu.open")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="lg:hidden"
            >
              <Menu aria-hidden />
            </IconButton>
          </header>
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        <Dialog
          open={menuOpen}
          onOpenChange={setMenuOpen}
          variant="drawer"
          title={t("nav.menu.title")}
          closeLabel={t("nav.menu.close")}
        >
          <div className="-mx-6 -mb-6">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </Dialog>
        <MethodsDrawer />
        <ValidationMethodsTab />
        <AssistantHost />
        <UpdateToast />
      </div>
    </TooltipProvider>
  );
}
