import type { ReactNode } from "react";
import { cn, focusRing } from "../cn";

/**
 * A table that never pushes its card wider than the screen: it scrolls sideways inside its own glass
 * frame, and keyboard users can focus the frame to scroll it.
 */
export function TableScroll({
  label,
  children,
  className,
}: {
  /** Names the scrolling region for assistive technology. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be focusable to be keyboard scrollable (WCAG 2.1.1).
      tabIndex={0}
      className={cn(
        "relative max-w-full overflow-x-auto overscroll-x-contain rounded-panel border border-line-soft bg-glass [&_table]:min-w-full [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:whitespace-nowrap",
        focusRing,
        className,
      )}
    >
      {children}
    </section>
  );
}
