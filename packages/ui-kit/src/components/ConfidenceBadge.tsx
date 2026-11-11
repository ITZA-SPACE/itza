import { cn, focusRing } from "../cn";
import { Badge } from "./Badge";
import { Popover } from "./Popover";

export type ConfidenceLevel = "high" | "medium" | "low";

const marksAndTones = {
  high: { tone: "good", mark: "●●●" },
  medium: { tone: "warn", mark: "●●○" },
  low: { tone: "risk", mark: "●○○" },
} as const;

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
  const { tone, mark } = marksAndTones[level];
  const badge = (
    <Badge tone={tone}>
      <span aria-hidden="true">{mark}</span>
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
