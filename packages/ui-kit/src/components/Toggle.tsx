import * as RadixToggle from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";
import { cn, focusRing } from "../cn";

export function Toggle({ className, ...props }: ComponentProps<typeof RadixToggle.Root>) {
  return (
    <RadixToggle.Root
      className={cn(
        "glass-control inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium text-ink-muted hover:text-ink data-[state=on]:border-rain/60 data-[state=on]:bg-accent-soft data-[state=on]:font-semibold data-[state=on]:text-ink",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
