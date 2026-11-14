import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type Tone = "neutral" | "good" | "warn" | "risk" | "info";

/** Figma "Tag chip": tinted fill with a half-opacity rim in the same hue. */
const tones: Record<Tone, string> = {
  neutral: "border-ink-muted/50 bg-ink-muted/12 text-ink-muted",
  good: "border-good-ink/50 bg-good-soft text-good-ink",
  warn: "border-warn-ink/50 bg-warn-soft text-warn-ink",
  risk: "border-risk-ink/50 bg-risk-soft text-risk-ink",
  info: "border-rain/50 bg-rain/12 text-rain",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-caption font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
