import type { SeasonResult } from "@itza/engine/memory";
import type { ConfirmedSeason } from "../state";

/** The crop Field Memory proposes for a season: a pack crop id, `fallow` for bare seasons. */
export function proposedCrop(season: SeasonResult): string {
  return season.phenology.inferred.crop;
}

const bySeason = (a: ConfirmedSeason, b: ConfirmedSeason) => a.season.localeCompare(b.season);

/** The history with one season confirmed or corrected. */
export function withSeason(
  history: readonly ConfirmedSeason[],
  entry: ConfirmedSeason,
): ConfirmedSeason[] {
  return [...history.filter((s) => s.season !== entry.season), entry].sort(bySeason);
}

/** The history without a season (its confirmation is taken back). */
export function withoutSeason(
  history: readonly ConfirmedSeason[],
  season: string,
): ConfirmedSeason[] {
  return history.filter((s) => s.season !== season);
}

/**
 * Confirms every analysed season as proposed, keeping what the farmer already corrected. Seasons
 * with too little satellite data stay unconfirmed: there is nothing to confirm.
 */
export function confirmProposed(
  history: readonly ConfirmedSeason[],
  seasons: readonly SeasonResult[],
): ConfirmedSeason[] {
  const known = new Set(history.map((s) => s.season));
  const added = seasons
    .filter((s) => !s.insufficient && !known.has(s.phenology.season))
    .map((s) => ({ season: s.phenology.season, crop: proposedCrop(s) }));
  return [...history, ...added].sort(bySeason);
}
