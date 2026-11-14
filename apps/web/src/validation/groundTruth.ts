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

export interface ProofFieldHistory {
  id: string;
  /** Plain-English name shown in the UI; not a real surveyed field. */
  name: string;
  seasons: GroundTruthSeason[];
}

/**
 * Synthetic placeholder ground truth for three proof fields, standing in for the USDA NASS
 * Cropland Data Layer labels #17 will provide. Labels mostly, but not always, agree with a made-up
 * Field Memory inference, so the confusion summary below is not trivially 100%: a genuine synthetic
 * result would rarely be. None of this is a real validation measurement.
 */
export const SYNTHETIC_PROOF_FIELDS: readonly ProofFieldHistory[] = [
  {
    id: "proof-field-a",
    name: "Proof field A (synthetic)",
    seasons: [
      {
        season: "2015-16",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
      {
        season: "2016-17",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "high",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
      {
        season: "2017-18",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
      {
        season: "2018-19",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "medium",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
      {
        season: "2019-20",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "low",
        groundTruthCrop: "Dryland corn",
        groundTruthClass: "crop",
      },
      {
        season: "2020-21",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
    ],
  },
  {
    id: "proof-field-b",
    name: "Proof field B (synthetic)",
    seasons: [
      {
        season: "2016-17",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
      {
        season: "2017-18",
        inferredCrop: "Proso millet",
        inferredClass: "crop",
        inferredConfidence: "medium",
        groundTruthCrop: "Proso millet",
        groundTruthClass: "crop",
      },
      {
        season: "2018-19",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "high",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
      {
        season: "2019-20",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "medium",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
      {
        season: "2020-21",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "high",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
    ],
  },
  {
    id: "proof-field-c",
    name: "Proof field C (synthetic)",
    seasons: [
      {
        season: "2017-18",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
      {
        season: "2018-19",
        inferredCrop: "Dryland corn",
        inferredClass: "crop",
        inferredConfidence: "medium",
        groundTruthCrop: "Dryland corn",
        groundTruthClass: "crop",
      },
      {
        season: "2019-20",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "high",
        groundTruthCrop: "Fallow",
        groundTruthClass: "fallow",
      },
      {
        season: "2020-21",
        inferredCrop: "Winter wheat",
        inferredClass: "crop",
        inferredConfidence: "high",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
      {
        season: "2021-22",
        inferredCrop: "Fallow",
        inferredClass: "fallow",
        inferredConfidence: "low",
        groundTruthCrop: "Winter wheat",
        groundTruthClass: "crop",
      },
    ],
  },
];

export interface ConfusionSummary {
  totalSeasons: number;
  proofFields: number;
  cropCrop: number;
  cropFallow: number;
  fallowCrop: number;
  fallowFallow: number;
  agreement: number;
}

/** Crop/fallow confusion counts and overall agreement across every season of every proof field. */
export function summarizeConfusion(
  fields: readonly ProofFieldHistory[] = SYNTHETIC_PROOF_FIELDS,
): ConfusionSummary {
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
  };
}
