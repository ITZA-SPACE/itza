import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type Tone = "neutral" | "good" | "warn" | "risk" | "info";

/**
 * Figma "Tag chip": a pill with a full-strength rim in its hue over a soft vertical wash of the same
 * hue. The tone is always paired with a word, never carried by color alone.
 */
const tones: Record<Tone, string> = {
  neutral: "border-[#b9b9b9]/70 from-[#9d9d9d]/20 to-[#9e9e9e]/10 text-ink",
  info: "border-rain from-rain/20 to-rain/10 text-ink shadow-[0_0_6px_rgb(127_208_255_/_0.45)]",
  good: "border-good-ink/80 from-good-ink/20 to-good-ink/8 text-good-ink",
  warn: "border-warn-ink/80 from-warn-ink/20 to-warn-ink/8 text-warn-ink",
  risk: "border-risk-ink/80 from-risk-ink/20 to-risk-ink/8 text-risk-ink",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border bg-gradient-to-t px-3 py-0.5 text-[0.75rem] leading-4 font-bold [overflow-wrap:anywhere]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
