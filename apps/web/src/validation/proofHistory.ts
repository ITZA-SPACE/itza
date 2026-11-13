import type { SeasonResult } from "@itza/engine/memory";
import type {
  FieldClass,
  GroundTruthSeason,
  ProofFieldHistory,
  SkippedSeason,
} from "./groundTruth";

/** One year of the USDA NASS Cropland Data Layer for a proof field, as `cdl.json` stores it. */
export interface CdlLabel {
  /** Calendar year of the crop, for example `2021`. */
  season: string;
  /** Modal class over the sampling polygon: crop, fallow, or something not comparable. */
  label: string;
  /** CDL class code to pixel count. */
  histogram: Record<string, number>;
  fraction: number;
}

/** Common Cropland Data Layer classes of the Central Great Plains, by CDL code. */
const CDL_CLASSES: Record<string, string> = {
  "1": "Corn",
  "4": "Sorghum",
  "21": "Barley",
  "22": "Durum wheat",
  "23": "Spring wheat",
  "24": "Winter wheat",
  "28": "Oats",
  "29": "Millet",
  "36": "Alfalfa",
  "37": "Other hay",
  "61": "Fallow",
  "176": "Grassland",
  "225": "Winter wheat then corn",
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Reads `cdl.json`; anything that is not the expected shape gives an empty list. */
export function parseCdl(json: unknown): CdlLabel[] {
  if (!isRecord(json) || !Array.isArray(json.labels)) return [];
  const labels: CdlLabel[] = [];
  for (const item of json.labels) {
    if (
      isRecord(item) &&
      typeof item.season === "string" &&
      typeof item.label === "string" &&
      isRecord(item.histogram) &&
      typeof item.fraction === "number"
    ) {
      labels.push({
        season: item.season,
        label: item.label,
        histogram: item.histogram as Record<string, number>,
        fraction: item.fraction,
      });
    }
  }
  return labels;
}

/** The Field Memory season that ends in the CDL year: 2021 is the season `2020-21`. */
export function seasonIdForYear(year: number): string {
  return `${year - 1}-${String(year % 100).padStart(2, "0")}`;
}

/** The public record's own name for the modal class, for example "Winter wheat". */
export function cdlCropName(label: CdlLabel): string {
  const [code] = Object.entries(label.histogram).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (label.label === "fallow") return "Fallow";
  return (code && CDL_CLASSES[code]) || (code ? `Crop (class ${code})` : "Crop");
}

function classOf(label: SeasonResult["label"]): FieldClass | null {
  if (label === "fallow_or_bare") return "fallow";
  if (label === "uncertain") return null;
  return "crop";
}

const humanize = (id: string) => {
  const text = id.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Field Memory's label next to the public record for each season both cover. Seasons where Field
 * Memory is unsure or has no data, or where the record is mixed, are listed as skipped and left out
 * of the agreement figure.
 */
export function compareHistory(
  field: { id: string; name: string },
  memory: readonly SeasonResult[],
  cdl: readonly CdlLabel[],
): ProofFieldHistory {
  const byId = new Map(memory.map((s) => [s.phenology.season, s]));
  const seasons: GroundTruthSeason[] = [];
  const skipped: SkippedSeason[] = [];
  for (const record of cdl) {
    const id = seasonIdForYear(Number(record.season));
    const inferred = byId.get(id);
    if (!inferred) {
      skipped.push({ season: id, reason: "fieldMemoryNoData" });
      continue;
    }
    if (inferred.insufficient) {
      skipped.push({ season: id, reason: "fieldMemoryNoData" });
      continue;
    }
    const inferredClass = classOf(inferred.label);
    if (inferredClass === null) {
      skipped.push({ season: id, reason: "fieldMemoryUncertain" });
      continue;
    }
    if (record.label !== "crop" && record.label !== "fallow") {
      skipped.push({ season: id, reason: "recordMixed" });
      continue;
    }
    seasons.push({
      season: id,
      inferredCrop: humanize(inferred.phenology.inferred.crop),
      inferredClass,
      inferredConfidence: inferred.phenology.inferred.confidence,
      groundTruthCrop: cdlCropName(record),
      groundTruthClass: record.label,
    });
  }
  return { ...field, seasons, skipped };
}
