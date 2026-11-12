import { cn } from "../cn";

export interface ContributionPart {
  key: string;
  /** Plain-language criterion name. */
  label: string;
  /** Weighted contribution; the parts of one bar add up to its score. */
  value: number;
}

export interface ContributionBarProps {
  parts: readonly ContributionPart[];
  /** Value at the end of the bar; 1 for scores, so bars of different rotations share one scale. */
  max?: number;
  /** Accessible summary, e.g. "Score 0.73 from eight criteria". */
  summary: string;
  className?: string;
}

const COLORS = [
  "bg-cat-1",
  "bg-cat-2",
  "bg-cat-3",
  "bg-cat-4",
  "bg-cat-5",
  "bg-cat-6",
  "bg-cat-7",
  "bg-cat-8",
] as const;

/**
 * One stacked bar of per-criterion contributions that add up to a score. Colors are never the only
 * cue: every segment is named in the list below the bar, with its value.
 */
export function ContributionBar({ parts, max = 1, summary, className }: ContributionBarProps) {
  return (
    <figure className={cn("space-y-2", className)}>
      <div
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        {parts.map((part, i) => (
          <span
            key={part.key}
            className={cn(
              "h-full border-r border-surface last:border-r-0",
              COLORS[i % COLORS.length],
            )}
            style={{ width: `${Math.max(0, (part.value / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-ink-muted">
        {parts.map((part, i) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-2.5 shrink-0 rounded-sm", COLORS[i % COLORS.length])}
            />
            <span className="truncate">{part.label}</span>
            <span className="ml-auto tabular-nums text-ink">{part.value.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
