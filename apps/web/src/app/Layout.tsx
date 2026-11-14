import { Link, Outlet } from "@tanstack/react-router";
import { t } from "../copy";

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-widest text-emerald-900">
            {t("app.name")}
          </Link>
          <span className="text-sm text-stone-500">{t("app.tagline")}</span>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
