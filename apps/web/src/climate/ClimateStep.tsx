import { Button, ClimateStrip, EmptyState, Skeleton } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { AnomalyCalendar } from "./AnomalyCalendar";
import { IndicatorCards } from "./IndicatorCards";
import { formatNumber } from "./indicators";
import { Stripes } from "./Stripes";
import { useClimate } from "./useClimate";
import { WorstSeasonList } from "./WorstSeasons";

/** The Climate Fingerprint (F-04): what each season was like, how it compares and which were the worst. */
export function ClimateStep() {
  const { status, fingerprint } = useClimate();
  const [chosen, setChosen] = useState<string | null>(null);

  if (status === "no-field") {
    return (
      <EmptyState
        title={t("flow.needField")}
        action={
          <Button asChild>
            <Link to="/field">{t("flow.toField")}</Link>
          </Button>
        }
      />
    );
  }
  if (status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-body text-ink-muted">
          {t("climate.loading")}
        </p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!fingerprint) {
    return <EmptyState title={t("climate.empty.title")} description={t("climate.empty.body")} />;
  }

  const usable = fingerprint.seasons.filter((s) => s.usable);
  const season =
    usable.find((s) => s.label === chosen) ?? (usable.at(-1) as (typeof usable)[number]);
  return (
    <div className="space-y-8">
      <section aria-labelledby="climate-pick" className="space-y-2">
        <h2 id="climate-pick" className="text-title font-semibold text-ink">
          {t("climate.pick.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("climate.pick.body")}</p>
        <ClimateStrip
          label={t("climate.pick.label")}
          selectedId={season.label}
          onSelect={setChosen}
          items={usable.map((s) => ({
            id: s.label,
            label: s.label,
            // Dry seasons are orange, wet ones blue.
            value: -s.rainMm,
            caption: fmt(t("climate.pick.caption"), {
              season: s.label,
              rain: formatNumber(s.rainMm, 0),
            }),
          }))}
        />
        <h3 className="pt-2 text-body font-semibold text-ink">
          {fmt(t("climate.cards.title"), { season: season.label })}
        </h3>
        <IndicatorCards season={season} usable={usable} />
      </section>
      <Stripes seasons={usable} />
      <AnomalyCalendar seasons={usable} />
      <WorstSeasonList worst={fingerprint.worst} seasons={usable} />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link to="/history">{t("climate.back")}</Link>
        </Button>
        <Button asChild>
          <Link to="/compare">{t("climate.toCompare")}</Link>
        </Button>
      </div>
    </div>
  );
}
