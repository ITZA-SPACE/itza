import { TooltipProvider } from "@itza/ui-kit";
import { Link, Outlet } from "@tanstack/react-router";
import { t } from "../copy";
import { MethodsButton, MethodsDrawer } from "../methods";
import { OfflineIndicator, UpdateToast } from "../pwa";

export function RootLayout() {
  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-surface-muted text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface focus:p-3 focus:shadow-lg"
        >
          {t("app.skip")}
        </a>
        <header className="border-b border-line-soft bg-surface">
          <nav className="flex items-center gap-3 px-4 py-2">
            <Link to="/" className="text-xl font-bold tracking-widest text-accent-strong">
              {t("app.name")}
            </Link>
            <span className="hidden flex-1 text-caption text-ink-muted sm:block">
              {t("app.tagline")}
            </span>
            <span className="flex-1 sm:hidden" />
            <OfflineIndicator />
            <Link
              to="/settings"
              className="text-body text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("pwa.settings.link")}
            </Link>
            <MethodsButton />
          </nav>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <MethodsDrawer />
        <UpdateToast />
      </div>
    </TooltipProvider>
  );
}
