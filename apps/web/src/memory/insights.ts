import type { MemoryInsights, RotationPattern, SeasonResult } from "@itza/engine/memory";
import { toDayNumber } from "@itza/engine/physics";
import { t } from "../copy";
import { fmt } from "../lib/format";

const MIN_GROUP = 2;
const MIN_SHIFT_DAYS = 7;

/**
 * Green-up of dry seasons against the others, in days (positive: later in dry seasons). A season is
 * dry when its rain is below the median. Null without enough seasons with both a rain total and a
 * green-up date.
 */
export function dryYearGreenUpShift(
  seasons: readonly SeasonResult[],
  rainBySeason: ReadonlyMap<string, number>,
): number | null {
  const rows = seasons.flatMap((s) => {
    const rain = rainBySeason.get(s.phenology.season);
    const greenUp = s.phenology.green_up;
    if (s.insufficient || rain === undefined || !greenUp) return [];
    return [{ rain, offset: toDayNumber(greenUp) - toDayNumber(s.phenology.period.start) }];
  });
  if (rows.length < 2 * MIN_GROUP) return null;
  const sorted = rows.map((r) => r.rain).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2
      ? (sorted[Math.floor(mid)] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const dry = rows.filter((r) => r.rain < median);
  const wet = rows.filter((r) => r.rain >= median);
  if (dry.length < MIN_GROUP || wet.length < MIN_GROUP) return null;
  const mean = (xs: { offset: number }[]) => xs.reduce((a, r) => a + r.offset, 0) / xs.length;
  return mean(dry) - mean(wet);
}

function rotationSentence(rotation: RotationPattern): string | null {
  switch (rotation.kind) {
    case "continuous":
      return t("memory.insight.rotation.continuous");
    case "fallow_rotation":
      return fmt(t("memory.insight.rotation.fallow"), {
        period: rotation.period ?? 0,
        share: Math.round(rotation.agreement * 100),
      });
    case "crop_rotation":
      return fmt(t("memory.insight.rotation.crops"), {
        period: rotation.period ?? 0,
        share: Math.round(rotation.agreement * 100),
      });
    default:
      return t("memory.insight.rotation.irregular");
  }
}

/** The summary sentences, from the engine's structured numbers. */
export function insightSentences(
  insights: MemoryInsights,
  rotation: RotationPattern,
  greenUpShiftDays: number | null,
): string[] {
  if (insights.seasonsAnalysed === 0) return [];
  const out = [
    fmt(t("memory.insight.bare"), { months: insights.avgBareMonthsPerYear }),
    fmt(t("memory.insight.fallow"), {
      fallow: insights.fallowSeasons,
      total: insights.seasonsAnalysed,
    }),
  ];
  if (insights.longestBareDays > 0) {
    out.push(fmt(t("memory.insight.longestBare"), { days: insights.longestBareDays }));
  }
  if (insights.meanPeakNdvi !== null) {
    out.push(fmt(t("memory.insight.peak"), { ndvi: insights.meanPeakNdvi.toFixed(2) }));
  }
  const rotationText = rotationSentence(rotation);
  if (rotationText) out.push(rotationText);
  if (greenUpShiftDays !== null && Math.abs(greenUpShiftDays) >= MIN_SHIFT_DAYS) {
    out.push(
      fmt(
        t(greenUpShiftDays > 0 ? "memory.insight.greenUp.later" : "memory.insight.greenUp.earlier"),
        {
          weeks: Math.round(Math.abs(greenUpShiftDays) / 7),
        },
      ),
    );
  }
  return out;
}
