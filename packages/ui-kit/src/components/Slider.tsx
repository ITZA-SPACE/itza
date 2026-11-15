import * as RadixSlider from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn, focusRing } from "../cn";

export interface SliderProps extends ComponentProps<typeof RadixSlider.Root> {
  /** Accessible name for each thumb, in order. */
  thumbLabels: string[];
  /** Spoken value of a thumb, for example "minus 20 percent"; defaults to the number. */
  valueText?: (value: number) => string;
}

export function Slider({ thumbLabels, valueText, className, ...props }: SliderProps) {
  const values = props.value ?? props.defaultValue ?? [];
  return (
    <RadixSlider.Root
      className={cn("relative flex h-11 w-full touch-none items-center select-none", className)}
      {...props}
    >
      <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-glass-strong">
        <RadixSlider.Range className="absolute h-full rounded-full bg-aurora" />
      </RadixSlider.Track>
      {thumbLabels.map((label, index) => (
        <RadixSlider.Thumb
          key={label}
          aria-label={label}
          {...(valueText && values[index] !== undefined
            ? { "aria-valuetext": valueText(values[index] as number) }
            : {})}
          className={cn(
            "block size-5 rounded-full border-2 border-white bg-space shadow-glow",
            focusRing,
          )}
        />
      ))}
    </RadixSlider.Root>
  );
}
