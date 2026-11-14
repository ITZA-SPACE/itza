import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type Tone = "neutral" | "good" | "warn" | "risk";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  risk: "bg-risk-soft text-risk-ink",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 text-caption font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
