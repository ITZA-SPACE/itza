// Field Memory (TECHNICAL_ARCHITECTURE §7): NDVI history to seasons, labels and an inferred rotation.
import { toDayNumber, toIsoDate } from "../physics/dates";
import { inferRotation } from "./rotation";
import { analyseSeason, bareMatrix, type SeasonAnalysis, segmentSeasons } from "./seasons";
import { fillGaps, fitBias, GRID_STEP, observations, smooth, toGrid } from "./series";
import type {
  FieldMemoryInput,
  FieldMemoryResult,
  MemoryCalendar,
  MemoryInsights,
  MemoryOptions,
  SeasonLabel,
} from "./types";

export { inferRotation } from "./rotation";
export { fieldAverage } from "./series";
export type * from "./types";

export const DEFAULT_CALENDAR: MemoryCalendar = {
  agriculturalYearStartMonth: 9,
  bareNdviThreshold: 0.2,
};

export const DEFAULT_OPTIONS: MemoryOptions = {
  smoothingWindow: 7,
  maxGapDays: 32,
  minBareDays: 30,
  winterPeakMonths: [2, 5],
  summerPeakMonths: [6, 9],
  fallowPeakMax: 0.35,
  fallowAmplitudeMax: 0.15,
  cropPeakMin: 0.4,
  minCoverage: 0.6,
  crossCheckToleranceDays: 30,
};

const LABELS: SeasonLabel[] = [
  "winter_crop",
  "summer_crop",
  "double_crop",
  "fallow_or_bare",
  "uncertain",
];
const DAYS_PER_MONTH = 30.4375;

function emptyResult(): FieldMemoryResult {
  return {
    seasons: [],
    phenology: [],
    bareMatrix: { months: [], rows: [] },
    rotation: { kind: "irregular", period: null, pattern: [], agreement: 0 },
    insights: summarise([]),
    gaps: [],
    grid: { dates: [], ndvi: [], smoothed: [], flags: [] },
  };
}

function summarise(seasons: FieldMemoryResult["seasons"]): MemoryInsights {
  const analysed = seasons.filter((s) => !s.insufficient);
  const labelCounts = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<SeasonLabel, number>;
  for (const s of analysed) labelCounts[s.label]++;
  const peaks = analysed.map((s) => s.phenology.peak_ndvi).filter((v): v is number => v != null);
  const dominant = LABELS.filter((l) => l !== "uncertain").sort(
    (a, b) => labelCounts[b] - labelCounts[a],
  )[0];
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    seasonsAnalysed: analysed.length,
    seasonsInsufficient: seasons.length - analysed.length,
    labelCounts,
    fallowSeasons: labelCounts.fallow_or_bare,
    avgBareMonthsPerYear: analysed.length
      ? Math.round((mean(analysed.map((s) => s.bareDays)) / DAYS_PER_MONTH) * 10) / 10
      : 0,
    longestBareDays: Math.max(
      0,
      ...analysed.flatMap((s) =>
        s.phenology.bare_windows.map((w) => toDayNumber(w.end) - toDayNumber(w.start) + 1),
      ),
    ),
    meanPeakNdvi: peaks.length ? Math.round(mean(peaks) * 1000) / 1000 : null,
    dominantLabel: analysed.length && dominant && labelCounts[dominant] > 0 ? dominant : null,
  };
}

/**
 * Runs the whole Field Memory pipeline. Pure and deterministic; missing data degrades the result
 * (long gaps flagged, thin seasons marked insufficient) and never throws.
 */
export function analyseFieldMemory(input: FieldMemoryInput): FieldMemoryResult {
  const month = input.calendar?.agriculturalYearStartMonth;
  const calendar: MemoryCalendar = {
    agriculturalYearStartMonth:
      month !== undefined && Number.isInteger(month) && month >= 1 && month <= 12
        ? month
        : DEFAULT_CALENDAR.agriculturalYearStartMonth,
    bareNdviThreshold: input.calendar?.bareNdviThreshold ?? DEFAULT_CALENDAR.bareNdviThreshold,
  };
  const opts: MemoryOptions = { ...DEFAULT_OPTIONS, ...input.options };
  if (opts.smoothingWindow !== 5 && opts.smoothingWindow !== 7) opts.smoothingWindow = 7;

  const hls = input.series.filter((s) => s.sensor === "hls").flatMap(observations);
  const modis = input.series.filter((s) => s.sensor === "modis").flatMap(observations);
  const all = [...hls, ...modis];
  if (all.length === 0) return emptyResult();

  // 2. Common 8-day grid, anchored at the first agricultural year that the data reaches.
  const firstObs = Math.min(...all.map((o) => o.day));
  const lastObs = Math.max(...all.map((o) => o.day));
  const spans = segmentSeasons(firstObs, lastObs, calendar.agriculturalYearStartMonth);
  if (spans.length === 0) return emptyResult();
  const g0 = (spans[0] as { start: number }).start;
  const n = Math.floor(((spans[spans.length - 1] as { end: number }).end - g0) / GRID_STEP) + 1;
  const hlsGrid = toGrid(hls, g0, n);
  let modisGrid = toGrid(modis, g0, n);
  const fit = fitBias(modisGrid, hlsGrid);
  if (fit) modisGrid = modisGrid.map((v) => (v == null ? null : fit.slope * v + fit.intercept));
  const merged = hlsGrid.map((v, i) => v ?? modisGrid[i] ?? null);

  // 3. Gaps, then smoothing.
  const filled = fillGaps(merged, opts.maxGapDays);
  const days = merged.map((_, i) => g0 + i * GRID_STEP);
  const smoothed = smooth(filled.values, days, opts.smoothingWindow);

  // Long gaps, reported once as periods.
  const gaps: FieldMemoryResult["gaps"] = [];
  for (let i = 0; i < n; i++) {
    if (filled.flags[i] !== 2) continue;
    let j = i;
    while (j + 1 < n && filled.flags[j + 1] === 2) j++;
    gaps.push({
      start: toIsoDate(days[i] as number),
      end: toIsoDate((days[j] as number) + GRID_STEP - 1),
      days: (j - i + 1) * GRID_STEP,
    });
    i = j;
  }

  // 4-6. Seasons: phenology, labels.
  const grid = { g0, values: smoothed, flags: filled.flags };
  const refs = new Map((input.reference ?? []).map((r) => [r.season, r]));
  const analyses: SeasonAnalysis[] = spans.map((span) =>
    analyseSeason(grid, span, calendar.bareNdviThreshold, opts, refs.get(span.id)),
  );
  const seasons = analyses.map((a) => a.result);

  // 7. Rotation and summary.
  return {
    seasons,
    phenology: seasons.map((s) => s.phenology),
    bareMatrix: bareMatrix(grid, analyses, calendar.agriculturalYearStartMonth),
    rotation: inferRotation(seasons.map((s) => s.label)),
    insights: summarise(seasons),
    gaps,
    ...(fit
      ? {
          biasAdjustment: {
            slope: fit.slope,
            intercept: fit.intercept,
            overlapPoints: fit.overlapPoints,
          },
        }
      : {}),
    grid: {
      dates: days.map(toIsoDate),
      ndvi: filled.values,
      smoothed,
      flags: filled.flags,
    },
  };
}
