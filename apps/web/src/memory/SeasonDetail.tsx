import type { FieldMemoryResult, SeasonResult } from "@itza/engine/memory";
import type { KnowledgePack } from "@itza/knowledge";
import { Button, Disclosure, Select } from "@itza/ui-kit";
import { useId, useState } from "react";
import { t } from "../copy";
import { fmt, formatDate } from "../lib/format";
import { useFieldStore } from "../state";
import { proposedCrop, withoutSeason, withSeason } from "./confirm";
import { NdviCurve } from "./NdviCurve";
import { SeasonIcon } from "./SeasonIcon";

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{term}</dt>
      <dd className="text-ink">{children}</dd>
    </>
  );
}

/** One season opened: its curve, what Field Memory found, and the crop picker to confirm or correct it. */
const DOTS = { high: 3, medium: 2, low: 1 } as const;

export function SeasonDetail({
  season,
  grid,
  pack,
}: {
  season: SeasonResult;
  grid: FieldMemoryResult["grid"];
  pack: KnowledgePack;
}) {
  const id = useId();
  const history = useFieldStore((s) => s.confirmedHistory);
  const setConfirmedHistory = useFieldStore((s) => s.setConfirmedHistory);
  const { phenology } = season;
  const label = phenology.season;
  const confirmed = history.find((h) => h.season === label);
  const [choice, setChoice] = useState<string>(confirmed?.crop ?? proposedCrop(season));
  const names = new Map(pack.crops.map((c) => [c.id, c.name]));
  // A crop outside the pack (an old confirmation) stays selectable so nothing is silently changed.
  const options = [...pack.crops.map((c) => ({ id: c.id, name: c.name }))];
  if (!names.has(choice)) options.push({ id: choice, name: choice });
  const unchanged = confirmed?.crop === choice;

  return (
    <section aria-labelledby={`${id}-title`} className="glass-panel space-y-4 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeasonIcon label={season.label} className="text-accent-strong" />
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {fmt(t("memory.detail.title"), { season: label })}
        </h3>
        <span
          role="img"
          aria-label={t(`confidence.${phenology.inferred.confidence}`)}
          title={t(`confidence.${phenology.inferred.confidence}`)}
          className="inline-flex gap-0.5 text-ink-muted"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full border border-current ${i < DOTS[phenology.inferred.confidence] ? "bg-current" : ""}`}
            />
          ))}
        </span>
      </div>
      {season.insufficient ? (
        <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink">
          {t("memory.detail.insufficient")}
        </p>
      ) : (
        <>
          <NdviCurve grid={grid} season={season} />
          <Disclosure summary={t("memory.detail.facts")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
              {phenology.green_up ? (
                <Fact term={t("memory.fact.greenUp")}>{formatDate(phenology.green_up)}</Fact>
              ) : null}
              {phenology.peak_date && phenology.peak_ndvi != null ? (
                <Fact term={t("memory.fact.peak")}>
                  {formatDate(phenology.peak_date)} ({phenology.peak_ndvi.toFixed(2)})
                </Fact>
              ) : null}
              {phenology.senescence ? (
                <Fact term={t("memory.fact.senescence")}>{formatDate(phenology.senescence)}</Fact>
              ) : null}
              <Fact term={t("memory.fact.bare")}>
                {fmt(t("memory.fact.bareDays"), { days: season.bareDays })}
              </Fact>
              <Fact term={t("memory.fact.coverage")}>{Math.round(season.coverage * 100)}%</Fact>
            </dl>
            {season.crossCheck && !season.crossCheck.agrees ? (
              <p className="text-caption text-ink-muted">{t("memory.detail.crossCheck")}</p>
            ) : null}
            <p className="text-caption text-ink-muted">{t("memory.pick.hint")}</p>
          </Disclosure>
        </>
      )}
      <div className="space-y-2">
        <label htmlFor={`${id}-crop`} className="sr-only">
          {t("memory.pick.label")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id={`${id}-crop`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="w-full sm:w-64"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={unchanged}
            onClick={() =>
              setConfirmedHistory(withSeason(history, { season: label, crop: choice }))
            }
          >
            {confirmed ? t("memory.pick.update") : t("memory.pick.confirm")}
          </Button>
          {confirmed ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmedHistory(withoutSeason(history, label))}
            >
              {t("memory.pick.undo")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
