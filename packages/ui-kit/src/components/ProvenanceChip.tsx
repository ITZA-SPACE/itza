import type { ReactNode } from "react";
import { cn, focusRing } from "../cn";
import { Popover } from "./Popover";

export interface ProvenanceChipProps {
  source: string;
  resolution: string;
  period: string;
  /** Extra explanation shown when the chip is tapped. */
  detail?: ReactNode;
  /** Accessible name; defaults to the visible summary. */
  ariaLabel?: string;
  /** Field labels for the detail popover; copy lives in the app. */
  labels: { source: string; resolution: string; period: string };
  /** A small round source icon instead of the text chip; the same detail opens on tap. */
  compact?: boolean;
}

export function ProvenanceChip({
  source,
  resolution,
  period,
  detail,
  ariaLabel,
  labels,
  compact = false,
}: ProvenanceChipProps) {
  const summary = `${source} · ${resolution} · ${period}`;
  const icon = (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0">
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
  return (
    <Popover
      trigger={
        compact ? (
          <button
            type="button"
            aria-label={ariaLabel ?? summary}
            title={summary}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-rim bg-glass text-ink-muted hover:text-ink",
              focusRing,
            )}
          >
            {icon}
          </button>
        ) : (
          <button
            type="button"
            aria-label={ariaLabel ?? summary}
            className={cn(
              "inline-flex min-h-6 max-w-full items-start gap-1.5 rounded-[0.875rem] border border-rim bg-glass px-2.5 py-1 text-left text-[0.75rem] leading-4 text-ink-muted hover:border-rim-strong hover:text-ink",
              focusRing,
            )}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            >
              <ellipse cx="8" cy="3.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
            <span className="min-w-0 [overflow-wrap:anywhere]">{summary}</span>
          </button>
        )
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-ink-muted">{labels.source}</dt>
        <dd>{source}</dd>
        <dt className="text-ink-muted">{labels.resolution}</dt>
        <dd>{resolution}</dd>
        <dt className="text-ink-muted">{labels.period}</dt>
        <dd>{period}</dd>
      </dl>
      {detail ? <div className="mt-2 text-ink-muted">{detail}</div> : null}
    </Popover>
  );
}
