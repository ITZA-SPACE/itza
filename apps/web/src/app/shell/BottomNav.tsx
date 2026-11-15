import { cn, focusRing } from "@itza/ui-kit";
import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarClock, LayoutGrid, Map as MapIcon, Repeat, Sparkles } from "lucide-react";
import type { CopyKey } from "../../copy";
import { t } from "../../copy";

const TABS: {
  to: "/field" | "/history" | "/compare" | "/ask";
  label: CopyKey;
  icon: typeof MapIcon;
  /** Pages that light this tab up: the tab stands for its whole part of the app. */
  match: string[];
}[] = [
  { to: "/field", label: "nav.field", icon: MapIcon, match: ["/field", "/twin"] },
  { to: "/history", label: "nav.past", icon: CalendarClock, match: ["/history", "/climate"] },
  { to: "/compare", label: "nav.plan", icon: Repeat, match: ["/inputs", "/compare", "/builder"] },
  { to: "/ask", label: "nav.tab.ask", icon: Sparkles, match: ["/ask"] },
];

const tab =
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full border border-transparent px-1 text-[0.6875rem] leading-4 font-bold transition-colors [&_svg]:size-[22px]";

/**
 * The phone and tablet navigation (Figma "Navigation"): a glass track pinned above the home
 * indicator with the four main places and "More" for the rest. Labels stay visible, as Material and
 * Apple guidance ask for a bottom bar.
 */
export function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = TABS.find((x) => x.match.some((m) => pathname.startsWith(m)));
  return (
    <nav
      aria-label={t("nav.tabs.label")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="glass-track pointer-events-auto mx-auto flex max-w-md list-none gap-1 rounded-full bg-night/70 p-1 shadow-float">
        {TABS.map((item) => {
          const active = item === current;
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex min-w-0 flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  tab,
                  focusRing,
                  active ? "glass-selected text-ink" : "text-subtle hover:text-ink",
                )}
              >
                <Icon aria-hidden />
                <span className="truncate">{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={onMore}
            className={cn(
              tab,
              focusRing,
              !current && pathname !== "/"
                ? "glass-selected text-ink"
                : "text-subtle hover:text-ink",
            )}
          >
            <LayoutGrid aria-hidden />
            <span className="truncate">{t("nav.tab.more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
