import { cn, focusRing, Tooltip } from "@itza/ui-kit";
import type { ReactNode } from "react";

/**
 * One map tool: a round icon button whose name and one-line purpose show on hover and keyboard
 * focus. The name is also its accessible label, so the icon never has to explain itself alone.
 * `pressed` makes it a toggle (an active tool); without it, it is a plain action.
 */
export function MapTool({
  label,
  hint,
  icon,
  pressed,
  onClick,
  disabled = false,
  tone = "default",
  side = "left",
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "risk";
  side?: "left" | "right" | "top" | "bottom";
}) {
  return (
    <Tooltip
      side={side}
      content={
        <span className="block">
          <span className="block font-semibold text-ink">{label}</span>
          <span className="block text-ink-muted">{hint}</span>
        </span>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-[19px]",
          pressed
            ? "border-rain/60 bg-accent-soft text-ink shadow-glow"
            : tone === "risk"
              ? "text-risk-ink hover:bg-risk-soft"
              : "text-ink-muted hover:bg-glass-strong hover:text-ink",
          focusRing,
        )}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

/** A vertical glass group of map tools. */
export function MapToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="pointer-events-auto flex flex-col gap-1 rounded-full border border-rim bg-surface/85 p-1 shadow-glass backdrop-blur-md">
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}
