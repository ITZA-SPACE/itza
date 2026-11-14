import type { ConfidenceLevel } from "@itza/ui-kit";

export type FieldClass = "crop" | "fallow";

export interface GroundTruthSeason {
  season: string;
  /** Field Memory's inferred crop name for the season, as it would be shown elsewhere in the app. */
  inferredCrop: string;
  inferredClass: FieldClass;
  inferredConfidence: ConfidenceLevel;
  /** The public record's crop name for the same season and field. */
  groundTruthCrop: string;
  groundTruthClass: FieldClass;
}

/** A season that could not be compared, with the reason shown to the user. */
export interface SkippedSeason {
  season: string;
  reason: "fieldMemoryUncertain" | "fieldMemoryNoData" | "recordMixed";
}

export interface ProofFieldHistory {
  id: string;
  /** Plain-English name shown in the UI. */
  name: string;
  seasons: GroundTruthSeason[];
  /** Seasons left out of the agreement figure, never silently. */
  skipped: SkippedSeason[];
}

export interface ConfusionSummary {
  totalSeasons: number;
  proofFields: number;
  cropCrop: number;
  cropFallow: number;
  fallowCrop: number;
  fallowFallow: number;
  agreement: number;
  /** Seasons not compared (Field Memory unsure, or the public record mixed), across all fields. */
  skippedSeasons: number;
}

/** Crop/fallow confusion counts and overall agreement across every season of every proof field. */
export function summarizeConfusion(fields: readonly ProofFieldHistory[]): ConfusionSummary {
  const seasons = fields.flatMap((f) => f.seasons);
  let cropCrop = 0;
  let cropFallow = 0;
  let fallowCrop = 0;
  let fallowFallow = 0;
  for (const s of seasons) {
    if (s.inferredClass === "crop" && s.groundTruthClass === "crop") cropCrop++;
    else if (s.inferredClass === "crop" && s.groundTruthClass === "fallow") cropFallow++;
    else if (s.inferredClass === "fallow" && s.groundTruthClass === "crop") fallowCrop++;
    else fallowFallow++;
  }
  const agree = cropCrop + fallowFallow;
  return {
    totalSeasons: seasons.length,
    proofFields: fields.length,
    cropCrop,
    cropFallow,
    fallowCrop,
    fallowFallow,
    agreement: seasons.length > 0 ? agree / seasons.length : 0,
    skippedSeasons: fields.reduce((n, f) => n + f.skipped.length, 0),
  };
}
