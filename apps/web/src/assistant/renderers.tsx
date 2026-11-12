import type { Priorities } from "@itza/engine/contracts";
import type { TimelineResult } from "@itza/engine/worker";
import {
  Button,
  ClimateStrip,
  EvidenceCard,
  FutureToggle,
  ReplayBars,
  RotationCompare,
  SeasonSnapshot,
  Slider,
} from "@itza/ui-kit";
import type { AppRenderedName, RenderProps } from "@itza/ui-kit/catalog/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useState } from "react";
import { cardLabels, toCardView } from "../compare/cards";
import { replayLabels } from "../compare/ReplayView";
import { type CopyKey, t } from "../copy";
import { signed, sspDetail, sspLabel } from "../future/labels";
import { fmt } from "../lib/format";
import { useLayerState } from "../map/layers/layerStore";
import { useFieldStore } from "../state";
import { PRIORITY_KEYS } from "./tools";
import { useAssistantUi } from "./ui";
import {
  isClimateView,
  isCompareView,
  isEvidenceView,
  isFutureView,
  isProposalView,
  isTimelineView,
  type ProposalView,
  type TimelineView,
} from "./views";

function Note({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-control bg-surface-muted p-3 text-body text-ink-muted">
      {children}
    </p>
  );
}

const unavailable = () => <Note>{t("assistant.answer.unavailable")}</Note>;

function RotationCompareAnswer({ data, rotationIds }: { data: unknown; rotationIds?: unknown }) {
  if (!isCompareView(data)) return unavailable();
  const wanted = Array.isArray(rotationIds) ? rotationIds.map(String) : [];
  const cards = wanted.length
    ? data.cards.filter((c) => wanted.includes(c.rotation_id) || c.is_baseline)
    : data.cards;
  const labels = cardLabels();
  return (
    <RotationCompare
      label={t("compare.cards.label")}
      items={cards.map((card) => ({
        id: card.rotation_id,
        isBaseline: card.is_baseline,
        content: (
          <EvidenceCard
            card={toCardView(card, data.names[card.rotation_id] ?? card.rotation_id)}
            labels={labels}
          />
        ),
      }))}
    />
  );
}

function EvidenceCardAnswer({ data }: { data: unknown }) {
  if (!isEvidenceView(data)) return unavailable();
  return <EvidenceCard card={toCardView(data.card, data.name)} labels={cardLabels()} />;
}

/** Lanes to draw: the rotation in focus next to the baseline, or every rotation. */
function lanesOf(view: TimelineView): TimelineResult["lanes"] {
  const { lanes } = view.timeline;
  if (!view.focusId) return lanes;
  const shown = lanes.filter(
    (l) => l.rotation_id === view.focusId || l.rotation_id === view.baselineId,
  );
  return shown.length > 0 ? shown : lanes;
}

function ReplayBarsAnswer({ data, title }: { data: unknown; title?: unknown }) {
  if (!isTimelineView(data)) return unavailable();
  const { timeline, names, baselineId } = data;
  return (
    <section className="space-y-2">
      {typeof title === "string" ? (
        <h3 className="text-title font-semibold text-ink">{title}</h3>
      ) : null}
      <ReplayBars
        key={timeline.season}
        startDate={timeline.startDate}
        days={timeline.days}
        rain={timeline.rain}
        ndvi={timeline.ndvi}
        labels={replayLabels()}
        lanes={lanesOf(data).map((lane) => ({
          id: lane.rotation_id,
          name: names[lane.rotation_id] ?? lane.name,
          isBaseline: lane.rotation_id === baselineId,
          crop: lane.crop,
          soilWater: lane.soilWater,
          stress: lane.stress,
          cover: lane.cover,
        }))}
      />
    </section>
  );
}

function SeasonSnapshotAnswer({ data }: { data: unknown }) {
  if (!isTimelineView(data)) return unavailable();
  const { timeline, names, baselineId } = data;
  return (
    <SeasonSnapshot
      season={timeline.season}
      isWorst={timeline.season === data.worstSeason}
      rows={timeline.lanes.map((lane) => {
        const score = timeline.scores.find((s) => s.rotation_id === lane.rotation_id);
        return {
          id: lane.rotation_id,
          name: names[lane.rotation_id] ?? lane.name,
          isBaseline: lane.rotation_id === baselineId,
          crop: lane.crop,
          score: score?.composite ?? 0,
          band: score?.band ?? null,
        };
      })}
      labels={{
        heading: fmt(t("compare.season.heading"), { season: timeline.season }),
        score: t("compare.season.score"),
        band: (p10, p90) => fmt(t("compare.season.band"), { p10, p90 }),
        baseline: t("compare.baseline.badge"),
        worst: t("compare.season.worst"),
      }}
    />
  );
}

function ClimateStripAnswer({ data }: { data: unknown }) {
  if (!isClimateView(data)) return unavailable();
  return (
    <ClimateStrip
      items={data.items}
      label={t("compare.seasons.label")}
      {...(data.worstSeason ? { selectedId: data.worstSeason } : {})}
    />
  );
}

const TODAY = "today";

function FutureAnswer({ data }: { data: unknown }) {
  const [selected, setSelected] = useState(TODAY);
  if (!isFutureView(data)) return unavailable();
  const options = [
    { id: TODAY, label: t("future.option.today"), detail: t("future.option.today.detail") },
    ...data.ssps.map((s) => {
      const detail = sspDetail(s.ssp);
      return { id: s.ssp, label: sspLabel(s.ssp), ...(detail ? { detail } : {}) };
    }),
  ];
  const ssp = data.ssps.find((s) => s.ssp === selected);
  return (
    <section className="space-y-3">
      <h3 className="text-title font-semibold text-ink">
        {fmt(t("assistant.future.heading"), { name: data.name })}
      </h3>
      <FutureToggle
        options={options}
        value={selected}
        onChange={setSelected}
        legend={t("future.control.legend")}
        notForecast={t("future.notForecast")}
      />
      <div aria-live="polite" className="space-y-1 text-body text-ink">
        {ssp ? (
          <>
            <p className="font-medium">
              {fmt(t("assistant.future.scenario"), { ssp: sspLabel(ssp.ssp) })}
            </p>
            <p>
              {fmt(t("assistant.future.change"), {
                change: signed(ssp.scoreChange.median),
                min: signed(ssp.scoreChange.min),
                max: signed(ssp.scoreChange.max),
              })}
            </p>
            <p className="text-ink-muted">
              {fmt(t("assistant.future.stressChange"), { change: signed(ssp.severeChange, 0) })}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">{t("assistant.future.today")}</p>
            <p>{fmt(t("assistant.future.score"), { score: data.history.score.toFixed(2) })}</p>
            <p className="text-ink-muted">
              {fmt(t("assistant.future.stress"), { count: data.history.severe })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

const MAP_LAYER_IDS: Record<string, string | null> = {
  zones: null,
  ndvi: "ndvi",
  moisture: "soil-moisture",
  rain_anomaly: "rainfall",
  heat_days: "heat-days",
  frost_days: "frost-days",
};

function MapFocusAnswer({ layer }: { layer?: unknown }) {
  const name = typeof layer === "string" ? layer : "";
  const layerId = MAP_LAYER_IDS[name] ?? null;
  const navigate = useNavigate();
  const setOpen = useAssistantUi((s) => s.setOpen);
  useEffect(() => {
    if (!layerId) return;
    const state = useLayerState.getState();
    state.setActive(layerId);
    state.setShown(true);
  }, [layerId]);
  const label = t(`assistant.layer.${name}` as CopyKey);
  return (
    <div className="space-y-2">
      <Note>
        {layerId ? fmt(t("assistant.map.shown"), { layer: label }) : t("assistant.map.zones")}
      </Note>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(false);
          void navigate({ to: "/field" });
        }}
      >
        {t("assistant.map.open")}
      </Button>
    </div>
  );
}

const IRRIGATION = ["none", "supplemental", "full"] as const;

type Phase = "editing" | "applied" | "dismissed";

function ConfirmFormAnswer({ data, kind }: { data: unknown; kind?: unknown }) {
  const id = useId();
  const priorities = useFieldStore((s) => s.priorities);
  const constraints = useFieldStore((s) => s.inputs.constraints);
  const [phase, setPhase] = useState<Phase>("editing");
  const [draft, setDraft] = useState<ProposalView["values"] | null>(null);
  if (!isProposalView(data) || (kind !== undefined && kind !== data.kind))
    return <Note>{t("assistant.confirm.none")}</Note>;
  const values = draft ?? data.values;
  const kindLabel = t(`assistant.confirm.kind.${data.kind}` as CopyKey);
  if (Object.keys(values).length === 0) return <Note>{t("assistant.confirm.none")}</Note>;
  if (phase === "applied")
    return <Note>{fmt(t("assistant.confirm.applied"), { kind: kindLabel })}</Note>;
  if (phase === "dismissed") return <Note>{t("assistant.confirm.dismissed")}</Note>;

  const set = (key: string, value: string | number) => setDraft({ ...values, [key]: value });
  const apply = () => {
    const store = useFieldStore.getState();
    if (data.kind === "priorities") {
      const next = { ...store.priorities } as Record<string, number>;
      for (const [key, value] of Object.entries(values))
        if (typeof value === "number") next[key] = value;
      store.setPriorities(next as unknown as Priorities);
    } else {
      const current = store.inputs.constraints;
      const level =
        typeof values.irrigation === "string" ? values.irrigation : current.irrigation.level;
      store.setInputs({
        constraints: {
          ...current,
          irrigation: {
            level: level as (typeof IRRIGATION)[number],
            ...(level !== "none" && current.irrigation.cap_mm !== undefined
              ? { cap_mm: current.irrigation.cap_mm }
              : {}),
          },
          livestock:
            values.livestock === undefined ? current.livestock : values.livestock === "yes",
          excluded_crops:
            typeof values.excluded_crops === "string"
              ? values.excluded_crops.split(",").filter(Boolean)
              : (current.excluded_crops ?? []),
        },
      });
    }
    setPhase("applied");
  };

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-card border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t(`assistant.confirm.${data.kind}` as CopyKey)}
        </h3>
        <p className="text-caption text-ink-muted">{t("assistant.confirm.hint")}</p>
      </div>
      {data.kind === "priorities" ? (
        PRIORITY_KEYS.filter((key) => typeof values[key] === "number").map((key) => {
          const label = t(`assistant.priority.${key}` as CopyKey);
          const value = values[key] as number;
          return (
            <div key={key} className="space-y-1">
              <p className="text-body text-ink">
                {fmt(t("assistant.priority.value"), { label, value })}
              </p>
              <p className="text-caption text-ink-muted">
                {fmt(t("assistant.confirm.was"), { value: priorities[key] })}
              </p>
              <Slider
                min={0}
                max={5}
                step={1}
                value={[value]}
                onValueChange={([v]) => set(key, v ?? value)}
                thumbLabels={[label]}
              />
            </div>
          );
        })
      ) : (
        <div className="space-y-4">
          {values.irrigation !== undefined ? (
            <fieldset className="space-y-1">
              <legend className="text-body font-medium text-ink">
                {t("assistant.constraint.irrigation")}
              </legend>
              {IRRIGATION.map((level) => (
                <label key={level} className="flex min-h-11 items-center gap-2 text-body text-ink">
                  <input
                    type="radio"
                    name={`${id}-irrigation`}
                    checked={values.irrigation === level}
                    onChange={() => set("irrigation", level)}
                  />
                  {t(`assistant.constraint.irrigation.${level}` as CopyKey)}
                </label>
              ))}
              <p className="text-caption text-ink-muted">
                {fmt(t("assistant.confirm.wasText"), {
                  value: t(
                    `assistant.constraint.irrigation.${constraints.irrigation.level}` as CopyKey,
                  ),
                })}
              </p>
            </fieldset>
          ) : null}
          {values.livestock !== undefined ? (
            <fieldset className="space-y-1">
              <legend className="text-body font-medium text-ink">
                {t("assistant.constraint.livestock")}
              </legend>
              {(["yes", "no"] as const).map((answer) => (
                <label key={answer} className="flex min-h-11 items-center gap-2 text-body text-ink">
                  <input
                    type="radio"
                    name={`${id}-livestock`}
                    checked={values.livestock === answer}
                    onChange={() => set("livestock", answer)}
                  />
                  {t(`assistant.constraint.livestock.${answer}` as CopyKey)}
                </label>
              ))}
            </fieldset>
          ) : null}
          {values.excluded_crops !== undefined ? (
            <fieldset className="space-y-1">
              <legend className="text-body font-medium text-ink">
                {t("assistant.constraint.excluded_crops")}
              </legend>
              {(data.crops ?? []).map((crop) => {
                const chosen = String(values.excluded_crops).split(",").filter(Boolean);
                return (
                  <label
                    key={crop.id}
                    className="flex min-h-11 items-center gap-2 text-body text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(crop.id)}
                      onChange={(event) =>
                        set(
                          "excluded_crops",
                          (event.target.checked
                            ? [...chosen, crop.id]
                            : chosen.filter((c) => c !== crop.id)
                          ).join(","),
                        )
                      }
                    />
                    {crop.name}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t("assistant.confirm.confirm")}</Button>
        <Button type="button" variant="secondary" onClick={() => setPhase("dismissed")}>
          {t("assistant.confirm.cancel")}
        </Button>
      </div>
    </form>
  );
}

/** How each data component of the catalog is drawn in the app. */
export const renderers: Partial<Record<AppRenderedName, (props: RenderProps) => ReactNode>> = {
  RotationCompare: (p) => <RotationCompareAnswer data={p.data} rotationIds={p.rotationIds} />,
  EvidenceCard: (p) => <EvidenceCardAnswer data={p.data} />,
  ReplayBars: (p) => <ReplayBarsAnswer data={p.data} title={p.title} />,
  SeasonSnapshot: (p) => <SeasonSnapshotAnswer data={p.data} />,
  ClimateStrip: (p) => <ClimateStripAnswer data={p.data} />,
  FutureToggle: (p) => <FutureAnswer data={p.data} />,
  MapFocus: (p) => <MapFocusAnswer layer={p.layer} />,
  ConfirmForm: (p) => <ConfirmFormAnswer data={p.data} kind={p.kind} />,
};
