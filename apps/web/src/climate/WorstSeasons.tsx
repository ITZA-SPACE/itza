import type { Hazard, SeasonIndicators, WorstSeason, WorstSeasons } from "@itza/engine/climate";
import { Button } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import { formatNumber } from "./indicators";

const HAZARDS: { id: Hazard; title: CopyKey }[] = [
  { id: "lowest_rain", title: "climate.worst.lowest_rain" },
  { id: "highest_heat", title: "climate.worst.highest_heat" },
  { id: "driest_soil", title: "climate.worst.driest_soil" },
  { id: "worst_frost", title: "climate.worst.worst_frost" },
];

/**
 * Whether a season is worse than the average one for this hazard. With few seasons the ranking
 * reaches seasons that are better than average, and those are not "worst" in any useful sense.
 */
const isAdverse = (item: WorstSeason) =>
  item.hazard === "lowest_rain" || item.hazard === "driest_soil"
    ? item.deviation < 0
    : item.deviation > 0;

/** The key anomaly of a worst season in one plain sentence. */
function sentence(item: WorstSeason, season: SeasonIndicators): string {
  switch (item.hazard) {
    case "lowest_rain":
      return fmt(t("climate.worst.sentence.rain"), {
        season: item.season,
        rain: formatNumber(season.rainMm, 0),
        pct: formatNumber(Math.abs(item.deviation / item.mean) * 100, 0),
      });
    case "highest_heat":
      return fmt(t("climate.worst.sentence.heat"), {
        season: item.season,
        hot: season.heatDays30,
        veryHot: season.heatDays35,
      });
    case "driest_soil":
      return fmt(t("climate.worst.sentence.soil"), {
        season: item.season,
        z: formatNumber(Math.abs(item.value), 1),
      });
    default:
      return fmt(t("climate.worst.sentence.frost"), {
        season: item.season,
        frost: season.frostDays0,
        hard: season.frostDays2,
      });
  }
}

/** The three worst seasons per hazard, each with its key anomaly and a link to replay it. */
export function WorstSeasonList({
  worst,
  seasons,
}: {
  worst: WorstSeasons;
  seasons: readonly SeasonIndicators[];
}) {
  const id = useId();
  const byLabel = new Map(seasons.map((s) => [s.label, s]));
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("climate.worst.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("climate.worst.body")}</p>
      </div>
      {HAZARDS.map(({ id: hazard, title }) => {
        const items = worst[hazard].filter(isAdverse);
        return (
          <div key={hazard} className="space-y-2">
            <h3 className="text-body font-semibold text-ink">{t(title)}</h3>
            {items.length === 0 ? (
              <p className="text-body text-ink-muted">{t("climate.worst.none")}</p>
            ) : (
              <ol className="space-y-2">
                {items.map((item, rank) => {
                  const season = byLabel.get(item.season);
                  if (!season) return null;
                  return (
                    <li key={item.season} className="flex flex-wrap items-center gap-2">
                      <span className="text-body text-ink">
                        {rank + 1}. {sentence(item, season)}
                      </span>
                      <Button asChild variant="secondary">
                        <Link
                          to="/compare"
                          search={{ season: item.season }}
                          aria-label={fmt(t("climate.worst.replay.aria"), { season: item.season })}
                        >
                          {t("climate.worst.replay")}
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}
