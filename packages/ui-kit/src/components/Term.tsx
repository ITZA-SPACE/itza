import type { ReactNode } from "react";
import { cn, focusRing } from "../cn";
import { Popover } from "./Popover";

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

export interface TermProps {
  /** Full glossary heading shown in the popover, e.g. "Reference ET (ET0)". */
  title: string;
  /** Plain-language definition shown in the popover. */
  definition: string;
  /** Short label shown inline in running text, e.g. "ET0". */
  children: ReactNode;
}

/** Inline glossary term: tap or hover the label for a plain-language definition. */
export function Term({ title, definition, children }: TermProps) {
  return (
    <Popover
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-sm text-accent-strong underline decoration-dotted underline-offset-4",
            focusRing,
          )}
        >
          {children}
          <InfoIcon />
        </button>
      }
    >
      <p className="font-semibold">{title}</p>
      <p className="text-ink-muted">{definition}</p>
    </Popover>
  );
}
