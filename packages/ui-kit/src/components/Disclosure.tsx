import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Progressive disclosure: a glass row that opens to show detail. The summary says what is inside
 * (and how many items), so nothing important hides behind an unlabeled click.
 */
export function Disclosure({
  summary,
  count,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode;
  /** Shown as a small pill next to the summary, such as the number of items inside. */
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-panel border border-line-soft bg-glass", className)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none before:hidden items-center gap-3 rounded-panel px-4 py-2 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        {count !== undefined ? (
          <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-rim bg-glass px-2 text-caption font-bold text-ink-muted tabular-nums">
            {count}
          </span>
        ) : null}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="min-w-0 px-4 pb-4">{children}</div>
    </details>
  );
}
