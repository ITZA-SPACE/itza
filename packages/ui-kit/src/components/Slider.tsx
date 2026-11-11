import * as RadixSlider from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn, focusRing } from "../cn";

export interface SliderProps extends ComponentProps<typeof RadixSlider.Root> {
  /** Accessible name for each thumb, in order. */
  thumbLabels: string[];
}

export function Slider({ thumbLabels, className, ...props }: SliderProps) {
  return (
    <RadixSlider.Root
      className={cn("relative flex h-11 w-full touch-none items-center select-none", className)}
      {...props}
    >
      <RadixSlider.Track className="relative h-2 grow rounded-full bg-line-soft">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      {thumbLabels.map((label) => (
        <RadixSlider.Thumb
          key={label}
          aria-label={label}
          className={cn(
            "block size-6 rounded-full border-2 border-accent-strong bg-surface",
            focusRing,
          )}
        />
      ))}
    </RadixSlider.Root>
  );
}
