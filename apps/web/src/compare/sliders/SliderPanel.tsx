import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type CopyKey, t } from "../../copy";
import { fmt } from "../../lib/format";
import type { CompareState } from "../useCompare";
import { PrioritySliders } from "./PrioritySliders";
import { ScenarioSliders } from "./ScenarioSliders";
import { isPreset } from "./scenarios";

type Event = "replayed" | "reranked" | null;

export function shownScenario(id: string | undefined): string {
  if (id === undefined || id === "history") return t("sliders.showing.history");
  if (isPreset(id)) return t(`sliders.preset.${id}` as CopyKey).toLowerCase();
  if (id === "custom") return t("sliders.showing.custom");
  return t("sliders.showing.projection");
}

/** The priority and scenario sliders with one status line that sighted and screen-reader users share. */
export function SliderPanel({ state }: { state: CompareState }) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [event, setEvent] = useState<Event>(null);
  const { view, refreshing } = state;
  const was = useRef(refreshing);
  const shown = shownScenario(view?.output.scenario_id);

  useEffect(() => {
    if (was.current && !refreshing) setEvent("replayed");
    was.current = refreshing;
  }, [refreshing]);

  const reranked = useCallback(() => setEvent("reranked"), []);

  const status = pending
    ? t("sliders.status.waiting")
    : refreshing
      ? t("sliders.status.replaying")
      : event === "replayed"
        ? fmt(t("sliders.status.replayed"), { scenario: shown })
        : event === "reranked"
          ? fmt(t("sliders.status.reranked"), {
              name:
                view?.rotations.find((r) => r.id === view.output.results[0]?.rotation_id)?.name ??
                "",
            })
          : "";

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <h3 id={`${id}-title`} className="sr-only">
        {t("sliders.title")}
      </h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <PrioritySliders onChange={reranked} />
        <ScenarioSliders onPendingChange={setPending} />
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-body text-ink">
        {status}
      </p>
    </section>
  );
}
