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
}

export function ProvenanceChip({
  source,
  resolution,
  period,
  detail,
  ariaLabel,
  labels,
}: ProvenanceChipProps) {
  const summary = `${source} · ${resolution} · ${period}`;
  return (
    <Popover
      trigger={
        <button
          type="button"
          aria-label={ariaLabel ?? summary}
          className={cn(
            "inline-flex min-h-6 items-center rounded-full border border-rim bg-glass px-2.5 text-caption text-ink-muted hover:border-rim-strong hover:text-ink",
            focusRing,
          )}
        >
          {summary}
        </button>
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
