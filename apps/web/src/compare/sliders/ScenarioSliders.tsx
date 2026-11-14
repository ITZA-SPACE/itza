import { Button, Slider, Toggle } from "@itza/ui-kit";
import { useEffect, useRef, useState } from "react";
import { type CopyKey, t } from "../../copy";
import { fmt } from "../../lib/format";
import { useFieldStore } from "../../state";
import {
  type Deltas,
  deltasOf,
  HISTORY,
  PRESET_IDS,
  presetFor,
  RAIN_STEP,
  SLIDER_LIMITS,
  scenarioOf,
  springOnly,
  TEMP_STEP,
} from "./scenarios";

/** How long the sliders must rest before the replay starts, so scrubbing queues nothing. */
const SETTLE_MS = 400;

const MINUS = "−";

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `${MINUS}${Math.abs(n)}` : "0";
}

function rainSpoken(n: number): string {
  return n === 0
    ? t("sliders.rain.same")
    : fmt(t(n < 0 ? "sliders.rain.less" : "sliders.rain.more"), { n: Math.abs(n) });
}

function tempSpoken(n: number): string {
  return n === 0 ? t("sliders.temp.same") : fmt(t("sliders.temp.warmer"), { n });
}

/**
 * The scenario sliders and quick scenarios. The sliders move freely; the scenario reaches the store,
 * and so the replay, only after they rest for a moment.
 */
export function ScenarioSliders({
  onPendingChange,
}: {
  onPendingChange: (pending: boolean) => void;
}) {
  const scenario = useFieldStore((s) => s.scenario);
  const latitude = useFieldStore((s) => s.field?.centroid[1] ?? 0);
  const setScenario = useFieldStore((s) => s.setScenario);
  const [draft, setDraft] = useState<Deltas | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stored = deltasOf(scenario);
  const shown = draft ?? stored ?? { rainPct: 0, tempC: 0 };

  useEffect(() => onPendingChange(draft !== null), [draft, onPendingChange]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const move = (next: Deltas) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setDraft(null);
      const unchanged = stored && stored.rainPct === next.rainPct && stored.tempC === next.tempC;
      if (!unchanged) setScenario(scenarioOf(next));
    }, SETTLE_MS);
  };

  const choose = (next: ReturnType<typeof scenarioOf>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDraft(null);
    setScenario(next);
  };

  return (
    <div className="space-y-4">
      <fieldset className="min-w-0 space-y-3 border-0 p-0">
        <legend className="text-body font-semibold text-ink">{t("sliders.scenario.title")}</legend>
        <p className="text-caption text-ink-muted">{t("sliders.scenario.hint")}</p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body text-ink">{t("sliders.rain.label")}</span>
              <span aria-hidden="true" className="text-body font-medium text-ink">
                {fmt(t("sliders.rain.display"), { signed: signed(shown.rainPct) })}
              </span>
            </div>
            <Slider
              thumbLabels={[t("sliders.rain.label")]}
              valueText={rainSpoken}
              min={SLIDER_LIMITS.rainPct.min}
              max={SLIDER_LIMITS.rainPct.max}
              step={RAIN_STEP}
              value={[shown.rainPct]}
              onValueChange={([n]) => n !== undefined && move({ ...shown, rainPct: n })}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body text-ink">{t("sliders.temp.label")}</span>
              <span aria-hidden="true" className="text-body font-medium text-ink">
                {fmt(t("sliders.temp.display"), { signed: signed(shown.tempC) })}
              </span>
            </div>
            <Slider
              thumbLabels={[t("sliders.temp.label")]}
              valueText={tempSpoken}
              min={SLIDER_LIMITS.tempC.min}
              max={SLIDER_LIMITS.tempC.max}
              step={TEMP_STEP}
              value={[shown.tempC]}
              onValueChange={([n]) => n !== undefined && move({ ...shown, tempC: n })}
            />
          </div>
        </div>
        {scenario.kind === "projection" ? (
          <p className="text-caption text-ink-muted">{t("sliders.projection.note")}</p>
        ) : null}
        {draft === null && springOnly(scenario.id) ? (
          <p className="text-caption text-ink-muted">{t("sliders.spring.note")}</p>
        ) : null}
      </fieldset>

      <fieldset className="min-w-0 space-y-2 border-0 p-0">
        <legend className="text-body font-semibold text-ink">{t("sliders.preset.title")}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_IDS.map((id) => (
            <Toggle
              key={id}
              pressed={draft === null && scenario.id === id}
              onPressedChange={(on) => on && choose(presetFor(id, latitude))}
              aria-describedby={`preset-${id}`}
            >
              {t(`sliders.preset.${id}` as CopyKey)}
            </Toggle>
          ))}
          <Button
            variant="secondary"
            disabled={draft === null && scenario.kind === "history"}
            onClick={() => choose(HISTORY)}
          >
            {t("sliders.reset")}
          </Button>
        </div>
        <ul className="list-none space-y-0.5 p-0 text-caption text-ink-muted">
          {PRESET_IDS.map((id) => (
            <li key={id} id={`preset-${id}`}>
              <span className="font-medium text-ink">{t(`sliders.preset.${id}` as CopyKey)}:</span>{" "}
              {t(`sliders.preset.${id}.detail` as CopyKey)}
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
