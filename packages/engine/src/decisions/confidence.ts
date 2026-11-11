import type { CropEntry, KnowledgePack } from "@itza/knowledge";
import type { Confidence, EngineInput, FieldBundle, Soil } from "../contracts";
import { isCrop, observedByDay } from "../physics";
import { nominalTimeline, planRotation, type ReplayWorld, type RotationPlan } from "../replay";
import { confidenceText } from "./templates";

/** Observations the farmer gave beyond the soil values in the input (counts of what was entered). */
export interface GroundTruth {
  plantingDates?: number;
  yields?: number;
  irrigationEvents?: number;
}

export interface ConfidenceFactors {
  /** Share of days with observed weather, 0 to 1. */
  coverage: number;
  /** Width of the coarsest weather cell over the field's width; 1 or less means the field fills it. */
  scaleRatio: number;
  /** Correlation of modeled soil water with satellite soil moisture (monthly anomalies); null if unknown. */
  agreement: number | null;
  /** Trait confidence of the rotation's crops, 0.3 (all low) to 1 (all high). */
  traits: number;
  /** What the farmer observed, 0 (nothing) to 1. */
  groundTruth: number;
}

export interface ConfidenceResult {
  level: Confidence;
  /** Weighted score 0 to 1 that the level comes from. */
  score: number;
  factors: ConfidenceFactors;
  /** One plain-English reason per factor. */
  reasons: string[];
}

const WEIGHTS = {
  coverage: 0.25,
  scale: 0.15,
  agreement: 0.2,
  traits: 0.25,
  groundTruth: 0.15,
} as const;
const HIGH_FROM = 0.7;
const MEDIUM_FROM = 0.45;
const NEUTRAL_AGREEMENT = 0.5;
const MIN_MONTHS = 24;
const MIN_DAYS_PER_MONTH = 20;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const TRAIT_VALUE: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.3 };

/** Source ids of soil values entered by the farmer (ground truth overrides satellite estimates). */
export function observedSoilSources(soil: Soil): string[] {
  return Object.entries(soil)
    .filter(([, v]) => /^(user|observed)/i.test(v.source))
    .map(([name]) => name);
}

/** Ground-truth score: a soil test counts half, planting dates a quarter, yields or irrigation a quarter. */
export function groundTruthScore(
  soil: Soil,
  observations: GroundTruth = {},
): { score: number; items: string[] } {
  const items: string[] = [];
  let score = 0;
  if (observedSoilSources(soil).length > 0) {
    score += 0.5;
    items.push("a soil test");
  }
  if ((observations.plantingDates ?? 0) > 0) {
    score += 0.25;
    items.push("planting dates");
  }
  if ((observations.yields ?? 0) > 0 || (observations.irrigationEvents ?? 0) > 0) {
    score += 0.25;
    items.push("yields or irrigation");
  }
  return { score, items };
}

const TRAIT_KEYS = [
  "kc_ini",
  "kc_mid",
  "kc_end",
  "season_length_days",
  "root_depth_ini_m",
  "root_depth_max_m",
  "depletion_fraction",
  "t_base_c",
  "t_opt_c",
  "t_max_c",
  "n_credit_kg_ha",
  "residue_root_index",
  "cover_months",
  "forage_value",
  "market_flag",
] as const;

function traitConfidences(crop: CropEntry): Confidence[] {
  const out: Confidence[] = [];
  const record = crop as unknown as Record<string, { confidence?: Confidence } | undefined>;
  for (const key of TRAIT_KEYS) {
    const c = record[key]?.confidence;
    if (c) out.push(c);
  }
  if (isCrop(crop)) {
    for (const group of [crop.stage_days, crop.frost_threshold_c, crop.heat_threshold_c]) {
      for (const stage of Object.values(group)) out.push(stage.confidence);
    }
    out.push(crop.sowing_window.confidence);
  }
  return out;
}

/** Trait confidence of a set of crops: mean of high 1, medium 0.7, low 0.3, and the share that is low. */
export function traitConfidence(
  pack: Pick<KnowledgePack, "review">,
  crops: readonly CropEntry[],
): { score: number; lowShare: number; needsReview: boolean } | null {
  const all = [...new Set(crops)].flatMap(traitConfidences);
  if (all.length === 0) return null;
  const score = all.reduce((sum, c) => sum + TRAIT_VALUE[c], 0) / all.length;
  return {
    score,
    lowShare: all.filter((c) => c === "low").length / all.length,
    needsReview: pack.review.status === "needs_expert_review",
  };
}

/** The coarsest daily source the engine relies on and its size against the field. */
export function scaleOf(bundle: FieldBundle): {
  ratio: number;
  resolutionM: number;
  source: string;
} {
  const daily = bundle.series.filter(
    (s) =>
      s.cadence === "daily" && ["tmax", "tmin", "precip", "srad", "wind2m", "rh"].includes(s.var),
  );
  const coarsest = daily.reduce((best, s) =>
    s.provenance.resolution_m > best.provenance.resolution_m ? s : best,
  );
  const fieldSide = Math.sqrt(bundle.field.area_ha * 10_000);
  return {
    ratio: Math.max(1, coarsest.provenance.resolution_m / fieldSide),
    resolutionM: coarsest.provenance.resolution_m,
    source: coarsest.provenance.source,
  };
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] as number) - ma;
    const db = (b[i] as number) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  // A series that does not vary says nothing; floating-point noise must not pass for variance.
  return saa < 1e-12 || sbb < 1e-12 ? null : sab / Math.sqrt(saa * sbb);
}

/** Monthly means keyed by `year*12 + month` over days that have a value. */
function monthlyMeans(
  startDay: number,
  count: number,
  read: (i: number) => number | undefined,
): Map<number, number> {
  const sums = new Map<number, [number, number]>();
  for (let i = 0; i < count; i++) {
    const v = read(i);
    if (v === undefined) continue;
    const d = new Date((startDay + i) * 86_400_000);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const entry = sums.get(key) ?? [0, 0];
    sums.set(key, [entry[0] + v, entry[1] + 1]);
  }
  const means = new Map<number, number>();
  for (const [key, [sum, n]] of sums) if (n >= MIN_DAYS_PER_MONTH) means.set(key, sum / n);
  return means;
}

/**
 * Agreement between the modeled root-zone water (negative depletion of the farmer's current
 * rotation) and the satellite root-zone soil moisture: correlation of their monthly anomalies, the
 * departure of each month from the mean of the same calendar month. Seasonal cycles are removed, so
 * the number says whether the model catches wet and dry years, not whether winter is wetter than
 * summer. Null without the satellite series or with fewer than 24 months in common.
 */
export function modelSatelliteAgreement(
  world: ReplayWorld,
  baseline: RotationPlan,
  bundle: FieldBundle,
): { correlation: number; months: number } | null {
  const series = bundle.series.find((s) => s.var === "sm_rootzone" && s.cadence === "daily");
  if (!series) return null;
  const { ctx } = world;
  const observed = observedByDay(series);
  const timeline = nominalTimeline(ctx, planRotation(ctx, baseline));
  const start = ctx.forcing.startDay;
  const model = monthlyMeans(start, timeline.days, (i) => -(timeline.dr[i] as number));
  const sat = monthlyMeans(start, timeline.days, (i) => observed.get(start + i));
  const keys = [...model.keys()].filter((k) => sat.has(k)).sort((a, b) => a - b);
  if (keys.length < MIN_MONTHS) return null;
  const anomalies = (means: Map<number, number>) => {
    const byMonth = new Map<number, number[]>();
    for (const k of keys)
      byMonth.set(k % 12, [...(byMonth.get(k % 12) ?? []), means.get(k) as number]);
    const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return keys.map((k) => (means.get(k) as number) - average(byMonth.get(k % 12) as number[]));
  };
  const r = pearson(anomalies(model), anomalies(sat));
  return r === null ? null : { correlation: r, months: keys.length };
}

export interface ConfidenceInput {
  bundle: FieldBundle;
  input: Pick<EngineInput, "soil">;
  world: ReplayWorld;
  /** Crops of the rotation the card is about. */
  crops: readonly CropEntry[];
  /** Agreement of the model with the satellite, computed once per field. */
  agreement: { correlation: number; months: number } | null;
  groundTruth?: GroundTruth;
}

/**
 * Confidence label with reasons (F-08, §6.4): coverage of observed weather, field size against the
 * coarsest source, model-satellite agreement, trait confidence and ground truth, combined with fixed
 * weights (25, 15, 20, 25 and 15 %). High from 0.7, medium from 0.45, otherwise low. Unknown
 * agreement counts as neutral and is said so.
 */
export function confidenceFor({
  bundle,
  input,
  world,
  crops,
  agreement,
  groundTruth,
}: ConfidenceInput): ConfidenceResult {
  const { forcing } = world.ctx;
  let observedDays = 0;
  for (let i = 0; i < forcing.days; i++) observedDays += forcing.observed[i] as number;
  const coverage = forcing.days > 0 ? observedDays / forcing.days : 0;
  const scale = scaleOf(bundle);
  const traits = traitConfidence(world.pack, crops);
  const truth = groundTruthScore(input.soil, groundTruth);

  const factors: ConfidenceFactors = {
    coverage,
    scaleRatio: scale.ratio,
    agreement: agreement ? agreement.correlation : null,
    traits: traits ? traits.score : TRAIT_VALUE.medium,
    groundTruth: truth.score,
  };
  const scaleScore = clamp01(1 - Math.log10(scale.ratio) / 3);
  const coverageScore = clamp01((coverage - 0.5) / 0.5);
  const traitScore = clamp01((factors.traits - TRAIT_VALUE.low) / (1 - TRAIT_VALUE.low));
  const agreementScore = agreement ? clamp01(agreement.correlation) : NEUTRAL_AGREEMENT;
  const score =
    WEIGHTS.coverage * coverageScore +
    WEIGHTS.scale * scaleScore +
    WEIGHTS.agreement * agreementScore +
    WEIGHTS.traits * traitScore +
    WEIGHTS.groundTruth * truth.score;

  const reasons = [
    confidenceText.coverage(coverage),
    confidenceText.scale(scale.resolutionM, scale.source, bundle.field.area_ha, scale.ratio),
    agreement
      ? confidenceText.agreement(agreement.correlation, agreement.months)
      : confidenceText.noAgreement,
    traits ? confidenceText.traits(traits.lowShare, traits.needsReview) : confidenceText.noTraits,
    truth.items.length > 0 ? confidenceText.groundTruth(truth.items) : confidenceText.noGroundTruth,
  ];
  return {
    level: score >= HIGH_FROM ? "high" : score >= MEDIUM_FROM ? "medium" : "low",
    score,
    factors,
    reasons,
  };
}
