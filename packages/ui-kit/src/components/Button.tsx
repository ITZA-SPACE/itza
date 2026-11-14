import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn, focusRing } from "../cn";

type Variant = "primary" | "secondary" | "ghost" | "premium";
type Size = "md" | "sm";

/** Figma "Buttons": primary aurora, secondary/glass hairline, ghost text, premium leaf green. */
const variants: Record<Variant, string> = {
  primary:
    "bg-aurora font-bold text-white shadow-glow hover:brightness-110 active:brightness-95 [text-shadow:0_1px_1px_rgb(4_16_46_/_0.35)]",
  secondary: "glass-control font-semibold text-ink hover:bg-glass-strong",
  ghost: "font-semibold text-accent hover:bg-accent-soft",
  premium:
    "bg-gradient-to-br from-leaf to-forest font-bold text-on-accent shadow-glow-leaf hover:brightness-110",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-body",
  sm: "min-h-9 px-4 text-caption",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition-[filter,background-color,color] disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:shrink-0",
        focusRing,
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
