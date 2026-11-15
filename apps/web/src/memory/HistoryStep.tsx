import { Button, Dialog, Disclosure, EmptyState, ProvenanceChip, Skeleton } from "@itza/ui-kit";
import { Box, Check, Droplet, PencilLine } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { FlowBar } from "../app/shell/FlowBar";
import { useClimate } from "../climate/useClimate";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipFields, chipLabels } from "../lib/provenance";
import { useFieldStore } from "../state";
import { BareStrip } from "./BareStrip";
import { confirmProposed } from "./confirm";
import { CONFIDENCE_COPY, LABEL_COPY } from "./labels";
import { primaryNdvi } from "./ndvi";
import { SeasonDetail } from "./SeasonDetail";
import { useFieldMemory } from "./useFieldMemory";

// The 3D land loads only when the farmer opens it.
const FieldTwin = lazy(() => import("../twin/FieldTwin").then((m) => ({ default: m.FieldTwin })));

/**
 * The history step (F-03), after the Figma "Past": what grew each season as bars (tap one to fix
 * it), rain against normal, four numbers, and one question: does this match what you remember?
 */
/** `compact`: the guided demo's highlight (what the satellites saw and the season cards) only. */
export function HistoryStep({ compact = false }: { compact?: boolean } = {}) {
  const { status, bundle, region, result } = useFieldMemory();
  const { fingerprint } = useClimate();
  const confirmed = useFieldStore((s) => s.confirmedHistory);
  const setConfirmedHistory = useFieldStore((s) => s.setConfirmedHistory);
  const [chosen, setChosen] = useState<string | null>(null);
  const [land, setLand] = useState(false);
  const geometry = useFieldStore((s) => s.field?.geometry);
  const [fixing, setFixing] = useState(false);

  const seasons = result?.seasons ?? [];
  const selected = seasons.find(
    (s) => s.phenology.season === (chosen ?? seasons.at(-1)?.phenology.season),
  );

  if (status === "no-field") return null;
  if (status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-body text-ink-muted">
          {t("memory.loading")}
        </p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === "no-data" || !result || !region) {
    return <EmptyState title={t("memory.empty.title")} description={t("memory.empty.body")} />;
  }

  const ndvi = bundle ? primaryNdvi(bundle) : undefined;
  const confirmedCount = seasons.filter((s) =>
    confirmed.some((c) => c.season === s.phenology.season),
  ).length;
  const analysed = seasons.filter((s) => !s.insufficient).length;
  const { insights } = result;
  const cropped = analysed - insights.fallowSeasons;
  const usable = (fingerprint?.seasons ?? []).filter((s) => s.usable);
  const meanRain = usable.length ? usable.reduce((sum, s) => sum + s.rainMm, 0) / usable.length : 0;
  const maxDelta = Math.max(1, ...usable.map((s) => Math.abs(s.rainMm - meanRain)));
  const driest = [...usable].sort((x, y) => x.rainMm - y.rainMm).slice(0, 3);
  const first = seasons[0]?.phenology.season;
  const last = seasons.at(-1)?.phenology.season;
  const allConfirmed = confirmedCount >= analysed;
  const tiles = [
    { value: `${cropped} / ${analysed}`, label: t("past.tile.cropped") },
    { value: insights.avgBareMonthsPerYear.toFixed(1), label: t("past.tile.bare") },
    { value: String(insights.longestBareDays), label: t("past.tile.longest") },
    {
      value: insights.meanPeakNdvi === null ? "–" : insights.meanPeakNdvi.toFixed(2),
      label: t("past.tile.peak"),
    },
  ];

  return (
    <div className="space-y-4">
      {region.fallback ? (
        <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink">
          {t("memory.region.generic")}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <section aria-labelledby="past-grew" className="glass-panel space-y-4 rounded-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 id="past-grew" className="font-display text-title font-semibold text-ink">
                {t("past.grew")}
              </h2>
              {geometry ? (
                <Button type="button" size="sm" onClick={() => setLand(true)}>
                  <Box aria-hidden />
                  {t("past.land")}
                </Button>
              ) : null}
            </div>
            <p className="flex items-center gap-3 text-caption text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm bg-harvest" />
                {t("past.legend.crop")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm bg-ink-muted/50" />
                {t("past.legend.fallow")}
              </span>
            </p>
          </div>
          <div className="flex h-44 items-end gap-1.5">
            {seasons.map((s) => {
              const label = s.phenology.season;
              const peak = s.phenology.peak_ndvi ?? 0;
              const fallow = s.label === "fallow_or_bare" || s.label === "uncertain";
              const isConfirmed = confirmed.some((c) => c.season === label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={fixing && selected?.phenology.season === label}
                  aria-label={fmt(t("memory.timeline.item"), {
                    season: label,
                    label: t(LABEL_COPY[s.label]),
                    confidence: t(CONFIDENCE_COPY[s.phenology.inferred.confidence]),
                    status: isConfirmed
                      ? t("memory.status.confirmed")
                      : t("memory.status.proposed"),
                  })}
                  title={`${label} · ${t(LABEL_COPY[s.label])}`}
                  onClick={() => {
                    setChosen(label);
                    setFixing(true);
                  }}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span
                    className={`block w-full rounded-t-[6px] rounded-b-[2px] transition-opacity group-hover:opacity-80 ${
                      fallow ? "bg-ink-muted/50" : "bg-harvest"
                    } ${fixing && selected?.phenology.season === label ? "ring-2 ring-rain" : ""}`}
                    style={{ height: `${Math.max(6, Math.min(100, (peak / 0.8) * 100))}%` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-caption text-subtle tabular-nums">
            <span>{first}</span>
            {ndvi ? (
              <ProvenanceChip
                {...chipFields(ndvi.provenance)}
                ariaLabel={t("memory.provenance.aria")}
                labels={chipLabels()}
              />
            ) : null}
            <span>{last}</span>
          </div>
        </section>

        <section aria-labelledby="past-rain" className="glass-panel space-y-4 rounded-card p-5">
          <h2 id="past-rain" className="font-display text-title font-semibold text-ink">
            {t("past.rain")}
          </h2>
          {usable.length === 0 ? (
            <p className="text-body text-ink-muted">{t("climate.empty.title")}</p>
          ) : (
            <>
              <div className="flex h-44 items-stretch gap-1.5">
                {usable.map((s) => {
                  const delta = s.rainMm - meanRain;
                  const size = `${Math.max(4, (Math.abs(delta) / maxDelta) * 50)}%`;
                  return (
                    <span
                      key={s.label}
                      title={`${s.label}: ${Math.round(s.rainMm)} mm`}
                      className="relative min-w-0 flex-1"
                    >
                      <span
                        className={`absolute inset-x-0 rounded-[4px] ${delta >= 0 ? "bottom-1/2 bg-rain" : "top-1/2 bg-harvest"}`}
                        style={{ height: size }}
                      />
                    </span>
                  );
                })}
              </div>
              <p className="flex items-center gap-2 text-caption text-ink-muted">
                <Droplet aria-hidden className="size-4 shrink-0 text-harvest" />
                {fmt(t("past.driest"), { seasons: driest.map((s) => s.label).join(", ") })}
              </p>
            </>
          )}
        </section>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="glass-panel flex flex-col-reverse rounded-card px-5 py-4"
          >
            <dt className="text-caption text-ink-muted">{tile.label}</dt>
            <dd className="font-display text-[2rem] leading-10 font-bold text-ink tabular-nums">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      {compact ? null : (
        <>
          <FlowBar question={t("past.flow")}>
            <Button type="button" variant="secondary" onClick={() => setFixing((f) => !f)}>
              <PencilLine aria-hidden />
              {t("past.fix")}
            </Button>
            <Button
              type="button"
              disabled={allConfirmed}
              onClick={() => setConfirmedHistory(confirmProposed(confirmed, seasons))}
            >
              <Check aria-hidden />
              {t(allConfirmed ? "past.confirmed" : "past.right")}
            </Button>
          </FlowBar>
          {fixing && selected ? (
            <SeasonDetail
              key={selected.phenology.season}
              season={selected}
              grid={result.grid}
              pack={region.pack}
            />
          ) : null}
          <Disclosure summary={t("memory.bare.title")}>
            <BareStrip matrix={result.bareMatrix} />
          </Disclosure>
        </>
      )}
      {geometry ? (
        <Dialog
          open={land}
          onOpenChange={setLand}
          size="xl"
          title={t("past.land.title")}
          description={t("past.land.body")}
          closeLabel={t("past.land.close")}
        >
          {land ? (
            <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
              <FieldTwin geometry={geometry} lapseOpen />
            </Suspense>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
