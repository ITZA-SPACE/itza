import { Button, cn, Disclosure, focusRing, Skeleton } from "@itza/ui-kit";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Droplets, PawPrint, Sprout, Target } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { FlowBar } from "../app/shell/FlowBar";
import { PrioritySliders } from "../compare/sliders";
import { PRIORITY_KEYS } from "../compare/sliders/scenarios";
import { type CopyKey, t } from "../copy";
import { useFieldBundle } from "../data";
import { GroundTruthPanel } from "../groundtruth";
import { useSettled } from "../lib/useSettled";
import { useFieldMemory } from "../memory/useFieldMemory";
import { useFieldStore } from "../state";
import { acceptDefaults, setConstraints } from "./actions";
import { ConstraintsForm } from "./ConstraintsForm";
import { RotationEditor } from "./RotationEditor";
import { rotationProposal } from "./rotation";
import { SoilForm } from "./SoilForm";
import { type ShownSoil, SOIL_FIELDS, type SoilKey, shownSoil } from "./soil";
import { useReadiness } from "./useReadiness";

const SETTLE_MS = 800;
const LEVELS = ["none", "supplemental", "full"] as const;
/** A priority at 5 with the rest at 3 is "what matters most"; all at 3 is balanced. */
const TOP = 5;
const REST = 3;

const chip =
  "inline-flex min-h-10 items-center rounded-full border px-4 text-[0.875rem] font-semibold transition-colors";
const chipOn = "glass-selected border-rain/60 text-ink";
const chipOff = "border-rim bg-glass text-ink-muted hover:text-ink";

/** One question of the step: an icon, the question, and its answer as chips. */
function Question({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="glass-panel m-0 min-w-0 space-y-3 rounded-card p-5">
      <legend className="sr-only">{title}</legend>
      <p
        aria-hidden="true"
        className="flex items-center gap-2.5 font-display text-title font-semibold text-ink"
      >
        <span className="text-accent [&_svg]:size-5">{icon}</span>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
    </fieldset>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(chip, focusRing, on ? chipOn : chipOff)}
    >
      {children}
    </button>
  );
}

/**
 * The questions step (F-05): four answers only the farmer has (the rotation, water, animals and
 * what matters most). Soil and every other value come from data, labelled with their source, and
 * stay editable under "Fine-tune". Next accepts the defaults shown, so nothing blocks the way.
 */
export function InputsStep() {
  const navigate = useNavigate();
  const { region, result } = useFieldMemory();
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle } = useFieldBundle(geometry);
  const inputs = useFieldStore((s) => s.inputs);
  const history = useFieldStore((s) => s.confirmedHistory);
  const priorities = useFieldStore((s) => s.priorities);
  const setPriorities = useFieldStore((s) => s.setPriorities);
  const readiness = useReadiness();

  const proposal = useMemo(
    () => rotationProposal(inputs, history, result?.rotation.crops ?? []),
    [inputs, history, result],
  );

  if (!region) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!bundle && !readiness.accepted && readiness.checking) {
    return (
      <p role="status" className="text-body text-ink-muted">
        {t("inputs.loading")}
      </p>
    );
  }

  const shown = Object.fromEntries(
    SOIL_FIELDS.map((f) => [f.key, shownSoil(f.key, bundle?.soil, inputs.soil)]),
  ) as Record<SoilKey, ShownSoil>;
  const names = new Map(region.pack.crops.map((c) => [c.id, c.name]));
  const { constraints } = inputs;
  const top = PRIORITY_KEYS.filter((k) => priorities[k] === TOP);
  const focus =
    top.length === 1 && PRIORITY_KEYS.every((k) => k === top[0] || priorities[k] === REST)
      ? top[0]
      : null;
  const balanced = PRIORITY_KEYS.every((k) => priorities[k] === REST);
  const focusOn = (key: (typeof PRIORITY_KEYS)[number] | null) =>
    setPriorities({
      ...priorities,
      ...Object.fromEntries(PRIORITY_KEYS.map((k) => [k, k === key ? TOP : REST])),
    });
  const next = () => {
    if (!readiness.ready) acceptDefaults(proposal.crops, shown);
    void navigate({ to: "/twin" });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Question
          icon={<Sprout aria-hidden />}
          title={t("inputs.q.rotation")}
          note={t(`inputs.rotation.source.${proposal.source}` as CopyKey)}
        >
          {proposal.crops.length === 0 ? (
            <span className="text-body text-ink-muted">{t("inputs.rotation.empty")}</span>
          ) : (
            proposal.crops.map((crop, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a rotation may repeat a crop; position is its identity.
              <span key={`${crop}-${i}`} className={cn(chip, "border-rim bg-glass text-ink")}>
                {names.get(crop) ?? crop}
              </span>
            ))
          )}
        </Question>
        <Question icon={<Droplets aria-hidden />} title={t("inputs.q.water")}>
          {LEVELS.map((level) => (
            <Choice
              key={level}
              on={constraints.irrigation.level === level}
              onClick={() =>
                setConstraints({
                  irrigation:
                    level === "none"
                      ? { level }
                      : {
                          level,
                          ...(constraints.irrigation.cap_mm === undefined
                            ? {}
                            : { cap_mm: constraints.irrigation.cap_mm }),
                        },
                })
              }
            >
              {t(`inputs.irrigation.${level}` as CopyKey)}
            </Choice>
          ))}
        </Question>
        <Question icon={<PawPrint aria-hidden />} title={t("inputs.q.animals")}>
          <Choice on={!constraints.livestock} onClick={() => setConstraints({ livestock: false })}>
            {t("inputs.q.no")}
          </Choice>
          <Choice on={constraints.livestock} onClick={() => setConstraints({ livestock: true })}>
            {t("inputs.q.yes")}
          </Choice>
        </Question>
        <Question icon={<Target aria-hidden />} title={t("inputs.q.priority")}>
          <Choice on={balanced} onClick={() => focusOn(null)}>
            {t("inputs.q.balanced")}
          </Choice>
          {PRIORITY_KEYS.map((key) => (
            <Choice key={key} on={focus === key} onClick={() => focusOn(key)}>
              {t(`inputs.q.priority.${key}` as CopyKey)}
            </Choice>
          ))}
        </Question>
      </div>

      <Disclosure summary={t("inputs.fineTune")}>
        <div className="space-y-3">
          <p className="text-caption text-ink-muted">{t("inputs.fineTune.note")}</p>
          <Disclosure summary={t("inputs.rotation.title")}>
            <RotationEditor crops={proposal.crops} source={proposal.source} pack={region.pack} />
          </Disclosure>
          <SoilForm bundleSoil={bundle?.soil} overrides={inputs.soil} />
          <Disclosure summary={t("sliders.priorities.title")}>
            <PrioritySliders hideLegend />
          </Disclosure>
          <ConstraintsForm constraints={inputs.constraints} pack={region.pack} />
          <GroundTruthPanel />
        </div>
      </Disclosure>

      <FlowBar question={t("inputs.flow")}>
        <Button asChild variant="secondary">
          <Link to="/field">
            <ArrowLeft aria-hidden />
            {t("flow.back")}
          </Link>
        </Button>
        <Button type="button" onClick={next}>
          {t("flow.next")}
          <ArrowRight aria-hidden />
        </Button>
      </FlowBar>
    </div>
  );
}
