import { cn, focusRing } from "../cn";
import { Badge } from "./Badge";
import { Popover } from "./Popover";

export type ConfidenceLevel = "high" | "medium" | "low";

const levels = {
  high: { label: "High confidence", tone: "good", mark: "●●●" },
  medium: { label: "Medium confidence", tone: "warn", mark: "●●○" },
  low: { label: "Low confidence", tone: "risk", mark: "●○○" },
} as const;

export function ConfidenceBadge({
  level,
  reasons = [],
}: {
  level: ConfidenceLevel;
  reasons?: string[];
}) {
  const { label, tone, mark } = levels[level];
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
      <p className="font-semibold">Why {label.toLowerCase()}</p>
      <ul className="mt-1 list-disc pl-5 text-ink-muted">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </Popover>
  );
}
