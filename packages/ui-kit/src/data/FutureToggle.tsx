import { useId } from "react";
import { cn } from "../cn";
import { Badge } from "../components/Badge";

export interface FutureToggleOption {
  id: string;
  /** Plain-language name, e.g. "Today" or "SSP2-4.5". */
  label: string;
  /** What it means, e.g. "Middle of the road". Shown under the label. */
  detail?: string;
}

export interface FutureToggleProps {
  /** The options in order; the first is usually "Today". */
  options: readonly FutureToggleOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group, e.g. "Climate to replay". */
  legend: string;
  /** "Scenario, not forecast": always shown beside the choice. */
  notForecast: string;
  className?: string;
}

/**
 * Today or a future scenario, as one choice (F-14). Radio buttons under the hood, so the arrow keys
 * move between options and a screen reader hears the group name; the caption says what a future
 * result is. Pure and controlled, reused by the assistant to flip an answer between Today and 2050.
 */
export function FutureToggle({
  options,
  value,
  onChange,
  legend,
  notForecast,
  className,
}: FutureToggleProps) {
  const name = useId();
  return (
    <fieldset className={cn("m-0 space-y-2 border-0 p-0", className)}>
      <legend className="mb-1 text-body font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-11 cursor-pointer flex-col justify-center rounded-control border border-line px-4 py-1 text-ink hover:bg-surface-muted has-[:checked]:border-accent-strong has-[:checked]:bg-accent-soft has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            <span className="text-body">{option.label}</span>
            {option.detail ? (
              <span className="text-caption font-normal text-ink-muted">{option.detail}</span>
            ) : null}
          </label>
        ))}
      </div>
      <Badge tone="warn">{notForecast}</Badge>
    </fieldset>
  );
}
