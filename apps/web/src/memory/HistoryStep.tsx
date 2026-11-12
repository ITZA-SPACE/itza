import { Button, EmptyState, ProvenanceChip, Skeleton } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClimate } from "../climate/useClimate";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipFields, chipLabels } from "../lib/provenance";
import { useFieldStore } from "../state";
import { BareStrip } from "./BareStrip";
import { confirmProposed } from "./confirm";
import { dryYearGreenUpShift, insightSentences } from "./insights";
import { primaryNdvi } from "./ndvi";
import { SeasonDetail } from "./SeasonDetail";
import { Timeline } from "./Timeline";
import { useFieldMemory } from "./useFieldMemory";

/**
 * The history step (F-03): the seasons Field Memory read from the satellites, to confirm or correct
 * one by one, with the bare-soil heat strip and the plain-language summary.
 */
export function HistoryStep() {
  const { status, bundle, region, result } = useFieldMemory();
  const { fingerprint } = useClimate();
  const confirmed = useFieldStore((s) => s.confirmedHistory);
  const setConfirmedHistory = useFieldStore((s) => s.setConfirmedHistory);
  const [chosen, setChosen] = useState<string | null>(null);

  const seasons = result?.seasons ?? [];
  const selected = seasons.find(
    (s) => s.phenology.season === (chosen ?? seasons.at(-1)?.phenology.season),
  );
  const sentences = useMemo(() => {
    if (!result) return [];
    const rain = new Map((fingerprint?.seasons ?? []).map((s) => [s.label, s.rainMm]));
    return insightSentences(
      result.insights,
      result.rotation,
      dryYearGreenUpShift(result.seasons, rain),
    );
  }, [result, fingerprint]);

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

  return (
    <div className="space-y-6">
      {region.fallback ? (
        <p role="status" className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink">
          {t("memory.region.generic")}
        </p>
      ) : null}
      <section aria-labelledby="memory-insights" className="space-y-2">
        <h2 id="memory-insights" className="text-title font-semibold text-ink">
          {t("memory.insights.title")}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-body text-ink">
          {sentences.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {ndvi ? (
          <ProvenanceChip
            {...chipFields(ndvi.provenance)}
            ariaLabel={t("memory.provenance.aria")}
            labels={chipLabels()}
          />
        ) : null}
        {result.gaps.length > 0 ? (
          <p className="text-caption text-ink-muted">
            {fmt(t("memory.gaps"), { count: result.gaps.length })}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="memory-seasons" className="space-y-3">
        <div className="space-y-1">
          <h2 id="memory-seasons" className="text-title font-semibold text-ink">
            {t("memory.seasons.title")}
          </h2>
          <p className="text-body text-ink-muted">
            {fmt(t("memory.seasons.progress"), { done: confirmedCount, total: seasons.length })}
          </p>
        </div>
        <Timeline
          seasons={seasons}
          confirmed={confirmed}
          selected={selected?.phenology.season ?? null}
          onSelect={setChosen}
          pack={region.pack}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={confirmedCount >= analysed}
          onClick={() => setConfirmedHistory(confirmProposed(confirmed, seasons))}
        >
          {t("memory.confirmAll")}
        </Button>
        {selected ? (
          <SeasonDetail
            key={selected.phenology.season}
            season={selected}
            grid={result.grid}
            pack={region.pack}
          />
        ) : null}
      </section>

      <BareStrip matrix={result.bareMatrix} />

      <Button asChild variant="secondary">
        <Link to="/climate">{t("memory.toClimate")}</Link>
      </Button>
    </div>
  );
}
