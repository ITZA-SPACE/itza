import type { FieldMemoryResult, SeasonResult } from "@itza/engine/memory";
import type { KnowledgePack } from "@itza/knowledge";
import { Badge, Button } from "@itza/ui-kit";
import { useId, useState } from "react";
import { AppConfidenceBadge } from "../confidence";
import { t } from "../copy";
import { fmt, formatDate } from "../lib/format";
import { useFieldStore } from "../state";
import { proposedCrop, withoutSeason, withSeason } from "./confirm";
import { LABEL_COPY } from "./labels";
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
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-card border border-line-soft p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeasonIcon label={season.label} className="text-accent-strong" />
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {fmt(t("memory.detail.title"), { season: label })}
        </h3>
        <AppConfidenceBadge level={phenology.inferred.confidence} />
        {confirmed ? <Badge>{t("memory.status.confirmed")}</Badge> : null}
      </div>
      <p className="text-body text-ink">
        {fmt(t("memory.detail.proposal"), {
          label: t(LABEL_COPY[season.label]),
          crop: names.get(proposedCrop(season)) ?? proposedCrop(season),
        })}
      </p>
      {season.insufficient ? (
        <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink">
          {t("memory.detail.insufficient")}
        </p>
      ) : (
        <>
          <NdviCurve grid={grid} season={season} />
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
        </>
      )}
      <div className="space-y-2">
        <label htmlFor={`${id}-crop`} className="block text-body font-medium text-ink">
          {t("memory.pick.label")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={`${id}-crop`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-h-11 rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
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
        <p className="text-caption text-ink-muted">{t("memory.pick.hint")}</p>
      </div>
    </section>
  );
}
