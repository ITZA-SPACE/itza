import type { ReactNode } from "react";
import { SectionTabs } from "./SectionTabs";

/**
 * Figma "Page header": a big title, an optional short line under it, and on the right the section's
 * tabs plus the page's own controls.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Shown right after the title, such as "Scenario, not forecast". */
  badge?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.875rem] leading-9 font-bold text-ink sm:text-display">{title}</h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="text-[0.9375rem] leading-[1.375rem] text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SectionTabs />
        {actions}
      </div>
    </header>
  );
}
