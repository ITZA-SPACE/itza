import { cn, focusRing } from "../cn";
import { Badge } from "./Badge";
import { Popover } from "./Popover";

export type ConfidenceLevel = "high" | "medium" | "low";

const marksAndTones = {
  high: { tone: "good", filled: 3 },
  medium: { tone: "warn", filled: 2 },
  low: { tone: "risk", filled: 1 },
} as const;

/** Three dots, filled up to the level: the meter reads without color. */
function Meter({ filled }: { filled: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full border border-current",
            i < filled ? "bg-current" : "bg-transparent opacity-60",
          )}
        />
      ))}
    </span>
  );
}

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Plain-language label, e.g. "High confidence". */
  label: string;
  /** Heading for the reasons list, e.g. "Why high confidence". */
  reasonsHeading?: string;
  reasons?: string[];
}

export function ConfidenceBadge({
  level,
  label,
  reasonsHeading,
  reasons = [],
}: ConfidenceBadgeProps) {
  const { tone, filled } = marksAndTones[level];
  const badge = (
    <Badge tone={tone}>
      <Meter filled={filled} />
      {label}
    </Badge>
  );
  if (reasons.length === 0) return badge;
  return (
    <Popover
      trigger={
        <button type="button" className={cn("rounded-full", focusRing)}>
          {badge}
        </button>
      }
    >
      {reasonsHeading ? <p className="font-semibold">{reasonsHeading}</p> : null}
      <ul className="mt-1 list-disc pl-5 text-ink-muted">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </Popover>
  );
}
