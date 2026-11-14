import type { Priorities } from "@itza/engine/contracts";
import { Slider } from "@itza/ui-kit";
import { useEffect, useRef, useState } from "react";
import { type CopyKey, t } from "../../copy";
import { fmt } from "../../lib/format";
import { useFieldStore } from "../../state";
import { PRIORITY_KEYS } from "./scenarios";

const MAX = 5;

/**
 * The seven priority sliders. A drag is shown at once and reaches the store at most once per
 * animation frame, so the worker re-weighs the replay it already has instead of queueing a request
 * for every pixel of movement.
 */
export function PrioritySliders({ onChange }: { onChange?: () => void }) {
  const priorities = useFieldStore((s) => s.priorities);
  const setPriorities = useFieldStore((s) => s.setPriorities);
  const [draft, setDraft] = useState<Priorities | null>(null);
  const latest = useRef<Priorities>(priorities);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const flush = () => {
    frame.current = null;
    setPriorities(latest.current);
    setDraft(null);
    onChange?.();
  };

  const move = (key: keyof Priorities, value: number) => {
    latest.current = { ...(draft ?? priorities), [key]: value };
    setDraft(latest.current);
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  };

  const shown = draft ?? priorities;
  return (
    <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0">
      <legend className="text-body font-semibold text-ink">{t("sliders.priorities.title")}</legend>
      <p className="text-caption text-ink-muted">{t("sliders.priorities.hint")}</p>
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        {PRIORITY_KEYS.map((key) => {
          const label = t(`sliders.priority.${key}` as CopyKey);
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body text-ink">{label}</span>
                <span aria-hidden="true" className="text-body font-medium text-ink">
                  {fmt(t("sliders.priority.value"), { n: shown[key] })}
                </span>
              </div>
              <Slider
                thumbLabels={[label]}
                valueText={(n) => fmt(t("sliders.priority.spoken"), { n })}
                min={0}
                max={MAX}
                step={1}
                value={[shown[key]]}
                onValueChange={([n]) => n !== undefined && move(key, n)}
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
