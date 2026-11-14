import type { CanonicalSeries, PhenologySeason } from "../contracts";

/** Season labels (TECHNICAL_ARCHITECTURE §7 step 6). */
export type SeasonLabel =
  | "winter_crop"
  | "summer_crop"
  | "double_crop"
  | "fallow_or_bare"
  | "uncertain";

export type Confidence = PhenologySeason["inferred"]["confidence"];

/** One NDVI record of one sensor, shaped like a canonical series. `cadence: "static"` is ignored. */
export interface NdviSource
  extends Pick<CanonicalSeries, "cadence" | "start" | "values" | "quality"> {
  /** HLS (30 m, recent) is preferred over MODIS (250 m, long record) where both have data. */
  sensor: "hls" | "modis";
}

/** One pixel's series with its overlap weight, for `fieldAverage`. */
export interface PixelSeries {
  /** Share of the pixel that lies inside the field; 0 or less is ignored. */
  weight: number;
  values: (number | null)[];
  /** Same length as values: 2 means masked (cloud, snow, bad QA). Absent means all usable. */
  quality?: number[];
}

/** Region calendar from the knowledge pack (#7). */
export interface MemoryCalendar {
  /** 1 to 12. */
  agriculturalYearStartMonth: number;
  /** NDVI below this value counts as bare soil. */
  bareNdviThreshold: number;
}

/** Tunable rules; the defaults are the ones in the spec. */
export interface MemoryOptions {
  /** Savitzky-Golay window in grid steps, 5 or 7. */
  smoothingWindow: 5 | 7;
  /** Longest gap between valid grid points that is interpolated, in days. */
  maxGapDays: number;
  /** Shortest bare run that counts as a bare window, in days. */
  minBareDays: number;
  /** Peak month range (inclusive) of a winter crop. */
  winterPeakMonths: [number, number];
  /** Peak month range (inclusive) of a summer crop. */
  summerPeakMonths: [number, number];
  /** A peak below this NDVI is a weedy low peak: fallow. */
  fallowPeakMax: number;
  /** A season with less seasonal amplitude than this is fallow. */
  fallowAmplitudeMax: number;
  /** A peak must reach this NDVI to count as a crop peak (double-crop detection). */
  cropPeakMin: number;
  /** Seasons with a smaller share of valid grid points are not analysed. */
  minCoverage: number;
  /** Largest tolerated gap to MCD12Q2 dates before the season is flagged, in days. */
  crossCheckToleranceDays: number;
}

/** MCD12Q2 dates for one season, used only as a cross-check. */
export interface ReferenceSeason {
  season: string;
  green_up?: string;
  peak_date?: string;
  senescence?: string;
}

/**
 * Pack crop id written for each crop class (for example `winter_crop: "durum_wheat"`), so that
 * `phenology[].inferred.crop` and `rotation.crops` are ids the pack and the replay know. NDVI
 * cannot tell species apart: these are the region's typical crops, not observations. A class
 * without an entry keeps its class name; fallow is always the pack's `fallow`.
 */
export type CropIdMap = Partial<Record<"winter_crop" | "summer_crop" | "double_crop", string>>;

export interface FieldMemoryInput {
  series: NdviSource[];
  calendar?: Partial<MemoryCalendar>;
  crops?: CropIdMap;
  options?: Partial<MemoryOptions>;
  reference?: ReferenceSeason[];
}

export interface CrossCheck {
  agrees: boolean;
  /** Our date minus the reference date, in days, for each date present on both sides. */
  deltaDays: { green_up?: number; peak_date?: number; senescence?: number };
}

export interface SeasonResult {
  /** Contract shape, ready for `phenology[]` in the field bundle. */
  phenology: PhenologySeason;
  label: SeasonLabel;
  /** Peak minus the lowest NDVI of the season. */
  amplitude?: number;
  /** Sum of NDVI times days over the season. */
  integral?: number;
  /** Days spent in bare windows. */
  bareDays: number;
  /** Share of the season's grid points with a value, observed or interpolated. */
  coverage: number;
  /** True when the season was too incomplete to analyse. */
  insufficient: boolean;
  crossCheck?: CrossCheck;
}

export interface BareMatrix {
  /** Calendar months (1 to 12) in agricultural-year order. */
  months: number[];
  rows: {
    season: string;
    /** Per month: share of valid grid points inside a bare window (0 to 1), null with no data. */
    bareShare: (number | null)[];
  }[];
}

export type RotationKind = "continuous" | "fallow_rotation" | "crop_rotation" | "irregular";

export interface RotationPattern {
  kind: RotationKind;
  /** Cycle length in seasons; null when irregular. */
  period: number | null;
  /** One label per phase of the cycle, in order; empty when irregular. */
  pattern: SeasonLabel[];
  /** `pattern` as crop ids (same rule as `phenology[].inferred.crop`), ready as the baseline rotation. */
  crops: string[];
  /** Share of labelled seasons that match the pattern (0 to 1). */
  agreement: number;
}

/** Structured numbers behind the English summary templates (copy lives in the web app). */
export interface MemoryInsights {
  seasonsAnalysed: number;
  seasonsInsufficient: number;
  labelCounts: Record<SeasonLabel, number>;
  fallowSeasons: number;
  /** Mean months per agricultural year spent in bare windows. */
  avgBareMonthsPerYear: number;
  longestBareDays: number;
  meanPeakNdvi: number | null;
  dominantLabel: SeasonLabel | null;
}

export interface MemoryGap {
  start: string;
  end: string;
  days: number;
}

export interface FieldMemoryResult {
  seasons: SeasonResult[];
  /** `phenology[]` of the field bundle. */
  phenology: PhenologySeason[];
  bareMatrix: BareMatrix;
  rotation: RotationPattern;
  insights: MemoryInsights;
  /** Gaps longer than `maxGapDays` that were left unfilled. */
  gaps: MemoryGap[];
  /** MODIS to HLS fit over the overlap years; absent when there was no usable overlap. */
  biasAdjustment?: { slope: number; intercept: number; overlapPoints: number };
  /** The merged 8-day series, for charts. flags: 0 observed, 1 interpolated, 2 missing. */
  grid: {
    dates: string[];
    ndvi: (number | null)[];
    smoothed: (number | null)[];
    flags: number[];
  };
}
