import * as RadixToggle from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";
import { cn, focusRing } from "../cn";

export function Toggle({ className, ...props }: ComponentProps<typeof RadixToggle.Root>) {
  return (
    <RadixToggle.Root
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-ink hover:bg-surface-muted data-[state=on]:border-accent-strong data-[state=on]:bg-accent-soft data-[state=on]:font-semibold",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
