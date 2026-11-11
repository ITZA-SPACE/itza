import type { ReactNode } from "react";
import { cn, focusRing } from "../cn";
import { type GlossaryTermId, glossary } from "../glossary";
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

export function Term({ id, children }: { id: GlossaryTermId; children?: ReactNode }) {
  const entry = glossary[id];
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
          {children ?? entry.name}
          <InfoIcon />
        </button>
      }
    >
      <p className="font-semibold">{entry.title}</p>
      <p className="text-ink-muted">{entry.definition}</p>
    </Popover>
  );
}
