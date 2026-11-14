import type { ReactNode } from "react";

/**
 * Figma "Page header": a big Familjen Grotesk title, one plain line under it, and the page's own
 * controls on the right. `eyebrow` names where the page sits (a step of the guided flow).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  /** Shown right after the title, such as "Scenario, not forecast". */
  badge?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[0.75rem] leading-4 font-bold tracking-[0.06em] text-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.875rem] leading-9 font-bold text-ink sm:text-display">{title}</h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="max-w-3xl text-[0.9375rem] leading-[1.375rem] text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
