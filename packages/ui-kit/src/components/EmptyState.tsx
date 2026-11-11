import type { ReactNode } from "react";
import { cn } from "../cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-line p-8 text-center",
        className,
      )}
    >
      <p className="text-title font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-prose text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}
