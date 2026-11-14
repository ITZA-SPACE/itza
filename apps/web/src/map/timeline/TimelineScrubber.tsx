import { Slider, Toggle } from "@itza/ui-kit";
import { useEffect, useMemo } from "react";
import { t } from "../../copy";
import { type DateRange, type Granularity, labelFor, periodFor, periodStarts } from "./periods";
import { useTimeline } from "./timelineStore";

const GRANULARITIES: Granularity[] = ["month", "season", "year"];

/** Month, season or year steps across the data. Every layer and chart that follows the timeline moves with it. */
export function TimelineScrubber({ bounds }: { bounds: DateRange }) {
  const granularity = useTimeline((s) => s.granularity);
  const stored = useTimeline((s) => s.date);
  const setDate = useTimeline((s) => s.setDate);
  // Another view (the 3D time-lapse) may have moved the shared date outside this field's data;
  // bring it back to the nearest end so the layers have something to show.
  // ISO dates sort as text, so the middle of the three is the date kept within the bounds.
  const date =
    stored === null ? bounds.end : ([bounds.start, stored, bounds.end].sort()[1] as string);
  useEffect(() => {
    if (stored !== null && stored !== date) setDate(date);
  }, [stored, date, setDate]);
  const setGranularity = useTimeline((s) => s.setGranularity);
  const starts = useMemo(() => periodStarts(bounds, granularity), [bounds, granularity]);
  const current = periodFor(date, granularity).start;
  const index = Math.max(0, starts.indexOf(current));
  return (
    <section aria-labelledby="timeline-title" className="space-y-2">
      <h3 id="timeline-title" className="text-body font-semibold text-ink">
        {t("timeline.title")}
      </h3>
      <fieldset className="flex gap-2 border-0 p-0">
        <legend className="sr-only">{t("timeline.step")}</legend>
        {GRANULARITIES.map((g) => (
          <Toggle
            key={g}
            pressed={granularity === g}
            onPressedChange={(on) => on && setGranularity(g)}
          >
            {t(`timeline.${g}`)}
          </Toggle>
        ))}
      </fieldset>
      <Slider
        min={0}
        max={Math.max(0, starts.length - 1)}
        step={1}
        value={[index]}
        onValueChange={([i]) => {
          const next = starts[i ?? 0];
          if (next) setDate(next);
        }}
        thumbLabels={[t("timeline.thumb")]}
      />
      <p aria-live="polite" className="text-caption text-ink">
        {labelFor(date, granularity)}
      </p>
    </section>
  );
}
