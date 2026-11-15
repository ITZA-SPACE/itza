import { Button, Disclosure, ProvenanceChip } from "@itza/ui-kit";
import { useId, useState } from "react";
import { type CopyKey, t } from "../copy";
import { useFieldBundle } from "../data";
import { setSoilValue } from "../inputs/actions";
import { useSettled } from "../lib/useSettled";
import { useFieldStore } from "../state";
import { changeLog, soilKeyOf, withoutEntry } from "./overrides";
import { ReplayPreviewCard } from "./ReplayPreviewCard";

const inputClass =
  "min-h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Draft = Record<string, string>;

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), text);

function Field({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-body font-medium text-ink">
        {label}
        {unit ? <span className="ml-1 font-normal text-ink-muted">({unit})</span> : null}
      </label>
      {children(id)}
    </div>
  );
}

const SETTLE_MS = 800;

/**
 * Farmer observations that override satellite estimates (F-20): planting and harvest dates, yields
 * and irrigation. The soil test is the soil form of the inputs step; its values show in the change
 * log here and can be cleared from it.
 */
export function GroundTruthPanel() {
  const inputs = useFieldStore((s) => s.inputs);
  const groundTruth = useFieldStore((s) => s.groundTruth);
  const confirmedHistory = useFieldStore((s) => s.confirmedHistory);
  const setGroundTruth = useFieldStore((s) => s.setGroundTruth);
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle } = useFieldBundle(geometry);
  const { plantingDates, harvestDates, yields } = groundTruth;
  const seasons = confirmedHistory.map((s) => s.season);

  const [draft, setDraft] = useState<Draft>({});
  const [irrigation, setIrrigation] = useState({ date: "", mm: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const edit = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const shown = (key: string, stored: string | undefined) => draft[key] ?? stored ?? "";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];

    const nextPlanting: Record<string, string> = {};
    const nextHarvest: Record<string, string> = {};
    const nextYields: Record<string, number> = {};
    for (const season of seasons) {
      const planting = shown(`planting:${season}`, plantingDates[season]).trim();
      const harvest = shown(`harvest:${season}`, harvestDates[season]).trim();
      if (planting !== "") {
        if (Number.isNaN(Date.parse(planting)))
          problems.push(fill(t("groundTruth.error.date"), { label: season }));
        else nextPlanting[season] = planting;
      }
      if (harvest !== "") {
        if (Number.isNaN(Date.parse(harvest)))
          problems.push(fill(t("groundTruth.error.date"), { label: season }));
        else if (planting !== "" && harvest <= planting)
          problems.push(fill(t("groundTruth.error.order"), { label: season }));
        else nextHarvest[season] = harvest;
      }
      const raw = shown(`yield:${season}`, yields[season]?.toString()).trim();
      if (raw !== "") {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0)
          problems.push(
            fill(t("groundTruth.error.number"), {
              label: `${t("groundTruth.seasons.yield")} ${season}`,
            }),
          );
        else nextYields[season] = value;
      }
    }

    let events = groundTruth.irrigationEvents;
    if (irrigation.date !== "" || irrigation.mm !== "") {
      const mm = Number(irrigation.mm);
      if (Number.isNaN(Date.parse(irrigation.date)) || !(mm > 0))
        problems.push(t("groundTruth.error.irrigation"));
      else events = [...events, { date: irrigation.date, mm }];
    }

    setErrors(problems);
    if (problems.length > 0) {
      setSaved(false);
      return;
    }
    setGroundTruth({
      plantingDates: nextPlanting,
      harvestDates: nextHarvest,
      yields: nextYields,
      irrigationEvents: events,
    });
    setDraft({});
    setIrrigation({ date: "", mm: "" });
    setSaved(true);
  };

  const entries = changeLog({ inputs, groundTruth }, bundle?.soil);
  const clear = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    if (entry.kind === "soil") setSoilValue(soilKeyOf(entry), null);
    else setGroundTruth(withoutEntry(groundTruth, entry));
    setDraft((d) => {
      const { [entry.id]: _gone, ...rest } = d;
      return rest;
    });
    setSaved(false);
  };

  return (
    <Disclosure summary={<span id="ground-truth-title">{t("groundTruth.title")}</span>}>
      <div className="space-y-6">
        <p className="text-caption text-ink-muted">{t("groundTruth.intro")}</p>

        <form onSubmit={submit} className="space-y-6" noValidate>
          <fieldset className="space-y-3">
            <legend className="text-body font-semibold">{t("groundTruth.seasons.heading")}</legend>
            <p className="text-caption text-ink-muted">{t("groundTruth.seasons.hint")}</p>
            {seasons.length === 0 ? (
              <p className="text-body text-ink-muted">{t("groundTruth.seasons.none")}</p>
            ) : (
              seasons.map((season) => (
                <div
                  key={season}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-[6rem_1fr_1fr_1fr] sm:items-end"
                >
                  <p className="text-body font-medium">{season}</p>
                  <Field label={t("groundTruth.seasons.planting")}>
                    {(id) => (
                      <input
                        id={id}
                        type="date"
                        className={inputClass}
                        value={shown(`planting:${season}`, plantingDates[season])}
                        onChange={(e) => edit(`planting:${season}`, e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t("groundTruth.seasons.harvest")}>
                    {(id) => (
                      <input
                        id={id}
                        type="date"
                        className={inputClass}
                        value={shown(`harvest:${season}`, harvestDates[season])}
                        onChange={(e) => edit(`harvest:${season}`, e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t("groundTruth.seasons.yield")}>
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className={inputClass}
                        value={shown(`yield:${season}`, yields[season]?.toString())}
                        onChange={(e) => edit(`yield:${season}`, e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              ))
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-body font-semibold">
              {t("groundTruth.irrigation.heading")}
            </legend>
            <p className="text-caption text-ink-muted">{t("groundTruth.irrigation.hint")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("groundTruth.irrigation.date")}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    className={inputClass}
                    value={irrigation.date}
                    onChange={(e) => {
                      setIrrigation((i) => ({ ...i, date: e.target.value }));
                      setSaved(false);
                    }}
                  />
                )}
              </Field>
              <Field label={t("groundTruth.irrigation.amount")}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className={inputClass}
                    value={irrigation.mm}
                    onChange={(e) => {
                      setIrrigation((i) => ({ ...i, mm: e.target.value }));
                      setSaved(false);
                    }}
                  />
                )}
              </Field>
            </div>
          </fieldset>

          <div aria-live="polite" className="space-y-1">
            {errors.map((message) => (
              <p key={message} role="alert" className="text-body text-risk-ink">
                {message}
              </p>
            ))}
            {saved ? <p className="text-body text-ink">{t("groundTruth.saved")}</p> : null}
          </div>
          <Button type="submit">{t("groundTruth.submit")}</Button>
        </form>

        <ReplayPreviewCard />

        <section aria-labelledby="ground-truth-log" className="space-y-2">
          <h3 id="ground-truth-log" className="text-body font-semibold">
            {t("groundTruth.log.heading")}
          </h3>
          {entries.length === 0 ? (
            <p className="text-body text-ink-muted">{t("groundTruth.log.none")}</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry, index) => {
                const label = `${t(entry.label as CopyKey)}${entry.detail ? ` ${entry.detail}` : ""}`;
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line-soft p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-body">
                        <span className="font-medium">{label}:</span> {entry.value}
                      </p>
                      <p className="text-caption text-ink-muted">
                        {entry.replaced
                          ? fill(t("groundTruth.log.replaced"), { value: entry.replaced })
                          : t("groundTruth.log.noPrevious")}
                      </p>
                      <ProvenanceChip
                        source={t("groundTruth.provenance.source")}
                        resolution={t("groundTruth.provenance.resolution")}
                        period={t("groundTruth.provenance.period")}
                        labels={{
                          source: t("groundTruth.provenance.labelSource"),
                          resolution: t("groundTruth.provenance.labelResolution"),
                          period: t("groundTruth.provenance.labelPeriod"),
                        }}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => clear(index)}
                      aria-label={fill(t("groundTruth.log.clearLabel"), { label })}
                    >
                      {t("groundTruth.log.clear")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Disclosure>
  );
}
