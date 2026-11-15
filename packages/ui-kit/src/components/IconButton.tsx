import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn, focusRing } from "../cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The accessible name: an icon alone says nothing to a screen reader. */
  label: string;
  variant?: "glass" | "primary";
  asChild?: boolean;
}

/** Figma "Icon 48": a round glass button holding one icon. */
export function IconButton({
  label,
  variant = "glass",
  asChild = false,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-5",
        variant === "primary"
          ? "bg-aurora text-white shadow-glow hover:brightness-110"
          : "glass-control hover:bg-glass-strong",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
