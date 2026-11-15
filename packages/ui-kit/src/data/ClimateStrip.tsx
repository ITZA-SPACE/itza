import { cn, focusRing } from "../cn";

export interface ClimateStripItem {
  id: string;
  /** Short label such as the season `2021-22`. */
  label: string;
  /** The value that sets the color. */
  value: number;
  /** Text for the tooltip and assistive technology, e.g. "mean score 0.64". */
  caption: string;
}

export interface ClimateStripProps {
  items: readonly ClimateStripItem[];
  /** Value of the first color bin (lowest) and the last; defaults to the data's range. */
  min?: number;
  max?: number;
  /** Id of the selected item. */
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Accessible name of the strip. */
  label: string;
  className?: string;
}

// Blue (low) to orange (high): color-blind safe, always paired with the text caption.
// Fixed text colors: the stripes keep their light and dark fills whatever the theme.
const BINS = [
  "bg-div-neg-3 text-white",
  "bg-div-neg-2 text-white",
  "bg-div-neg-1 text-void",
  "bg-div-mid text-void",
  "bg-div-pos-1 text-void",
  "bg-div-pos-2 text-white",
  "bg-div-pos-3 text-white",
] as const;

function binOf(value: number, min: number, max: number): number {
  if (max <= min) return Math.floor(BINS.length / 2);
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return Math.min(BINS.length - 1, Math.floor(t * BINS.length));
}

/**
 * A row of stripes, one per season, colored by a value. With `onSelect` each stripe is a button
 * (a season picker); without it the strip is a read-only summary.
 */
export function ClimateStrip({
  items,
  min,
  max,
  selectedId,
  onSelect,
  label,
  className,
}: ClimateStripProps) {
  const values = items.map((i) => i.value);
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  return (
    <ul aria-label={label} className={cn("relative flex gap-1 overflow-x-auto pb-1", className)}>
      {items.map((item) => {
        const color = BINS[binOf(item.value, lo, hi)];
        const selected = item.id === selectedId;
        const body = (
          <>
            <span className="block text-caption font-medium">{item.label}</span>
            <span className="sr-only">{item.caption}</span>
          </>
        );
        const classes = cn(
          "flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center rounded-control border px-1",
          color,
          selected ? "border-transparent ring-2 ring-white/80" : "border-line-soft",
        );
        return (
          <li key={item.id} className="flex min-w-14 flex-1">
            {onSelect ? (
              <button
                type="button"
                title={item.caption}
                aria-pressed={selected}
                onClick={() => onSelect(item.id)}
                className={cn(classes, focusRing)}
              >
                {body}
              </button>
            ) : (
              <span title={item.caption} className={classes}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
