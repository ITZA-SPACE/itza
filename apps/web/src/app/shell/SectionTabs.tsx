import { cn, focusRing } from "@itza/ui-kit";
import { Link, useRouterState } from "@tanstack/react-router";
import { t } from "../../copy";
import { sectionOf } from "./nav";

/**
 * The pages of the current section as a Figma segmented control (Map | 3D, Seasons | Climate, ...).
 * Renders nothing for a single-page section.
 */
export function SectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionOf(pathname);
  if (!section || section.tabs.length < 2) return null;
  return (
    <nav aria-label={t(section.label)} className="glass-track flex rounded-full p-1">
      {section.tabs.map((tab) => {
        const active = pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-9 items-center rounded-full border border-transparent px-4 text-[0.875rem] font-semibold transition-colors",
              focusRing,
              active ? "glass-selected text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
