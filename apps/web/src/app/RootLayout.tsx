import { TooltipProvider } from "@itza/ui-kit";
import { Link, Outlet } from "@tanstack/react-router";
import { t } from "../copy";
import { MethodsButton, MethodsDrawer } from "../methods";

export function Layout() {
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link to="/" className="text-xl font-bold tracking-widest text-emerald-900">
              {t("app.name")}
            </Link>
            <span className="flex-1 text-sm text-stone-500">{t("app.tagline")}</span>
            <MethodsButton />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <Outlet />
        </main>
        <MethodsDrawer />
      </div>
    </TooltipProvider>
  );
}
