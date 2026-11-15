import type { SelectHTMLAttributes } from "react";
import { cn, focusRing } from "../cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes for the wrapper (width, margins); the control itself keeps the design system look. */
  className?: string;
}

/**
 * Figma "Select": a glass pill with the value on the left and a round chevron button on the right.
 * It stays a native `<select>`, so phones open their own picker and keyboards and screen readers
 * get the platform behavior.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative inline-flex max-w-full min-w-0", className)}>
      <select
        className={cn(
          "h-12 w-full min-w-0 cursor-pointer appearance-none truncate rounded-full border border-rim bg-glass py-0 pr-14 pl-5 text-body text-ink shadow-glass transition-colors hover:border-rim-strong focus-visible:border-space disabled:cursor-not-allowed disabled:opacity-40",
          focusRing,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-rim-strong bg-glass text-ink shadow-glass"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
