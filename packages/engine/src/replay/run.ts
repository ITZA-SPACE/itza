import { type CropEntry, loadPack, packForLocation } from "@itza/knowledge";
import type {
  Band,
  EngineInput,
  EngineOutput,
  FieldBundle,
  Priorities,
  RotationResult,
  SeasonResult,
} from "../contracts";
import { buildDailyForcing, soilParams } from "../physics";
import { agriculturalYears, monthSpans } from "./calendar";
import { yearRain } from "./erosion";
import { drawParameters, NOMINAL } from "./montecarlo";
import { weatherRisks } from "./pests";
import { compareRanking, resilience, winRate } from "./resilience";
import { CRITERIA_COUNT, composite, criterionWeights, toCriterionValues } from "./score";
import {
  planRotation,
  ReplayCache,
  type ReplayContext,
  type RotationPlan,
  runRotation,
} from "./simulate";
import { lowerMedianIndex, quantileSorted, round6 } from "./stats";

export interface ReplayRequest {
  bundle: FieldBundle;
  input: EngineInput;
  /** Knowledge pack id; by default the pack of the field's location. */
  packId?: string;
}

/** Everything a re-score needs: criteria per season for the nominal run and every Monte Carlo draw. */
export interface RotationRun {
  id: string;
  /** Position in the request, for stable ranking; the baseline-only rotation comes last. */
  order: number;
  labels: string[];
  crops: string[];
  /** Criteria of each season, `CRITERIA_COUNT` values per season. */
  nominal: Float64Array;
  /** Criteria per draw, season and criterion. */
  draws: Float64Array;
  severeWaterStress: Uint8Array;
  thermalHit: Uint8Array;
}

export interface ReplayRun {
  scenarioId: string;
  seed: number;
  drawCount: number;
  rotations: RotationRun[];
  baselineId: string | null;
}

const DEFAULT_DRAWS = 200;

function resolveEntry(pack: ReturnType<typeof loadPack>, id: string, where: string): CropEntry {
  const entry =
    pack.crops.find((c) => c.id === id) ??
    (id === "cover" ? pack.crops.find((c) => c.kind === "cover") : undefined);
  if (!entry) throw new RangeError(`Unknown crop "${id}" in ${where} for pack ${pack.id}`);
  return entry;
}

/**
 * Replays every rotation through every usable historical season, nominally and under the seeded
 * Monte Carlo draws. Weather comes from the bundle as it is: only the `history` scenario is
 * replayed here; slider and 2050 scenarios change the forcing first (scenarios module).
 */
export function simulateReplay({ bundle, input, packId }: ReplayRequest): ReplayRun {
  if (input.scenario.kind !== "history") {
    throw new RangeError(
      `Scenario kind "${input.scenario.kind}" needs adjusted weather; replay supports "history" only`,
    );
  }
  const [lon, lat] = bundle.field.centroid;
  const pack = loadPack(packId ?? packForLocation(lon, lat).pack.id);
  const forcing = buildDailyForcing(bundle);
  const startMonth = pack.calendar.agricultural_year_start_month.value;
  const years = agriculturalYears(forcing, startMonth).filter((y) => y.usable);
  if (years.length === 0)
    throw new RangeError("No agricultural year has enough weather observations");
  const spans = years.map((y) => monthSpans(y, startMonth));
  const ctx: ReplayContext = {
    forcing,
    soil: soilParams(input.soil),
    slopeDeg: bundle.field.slope_mean_deg ?? 0,
    pests: pack.pests,
    years,
    spans,
    rain: spans.map((s) => yearRain(forcing, s)),
    risks: weatherRisks(forcing, years),
  };

  const plans: RotationPlan[] = input.rotations.map((r) => ({
    id: r.id,
    seasons: r.seasons.map((s) => ({
      entry: resolveEntry(pack, s.crop, `rotation ${r.id}`),
      ...(s.sowing_doy === undefined ? {} : { sowingDoy: s.sowing_doy }),
    })),
  }));
  if (new Set(plans.map((p) => p.id)).size !== plans.length) {
    throw new RangeError("Rotation ids must be unique");
  }
  const baseline = input.baseline;
  if (baseline && !plans.some((p) => p.id === baseline.id)) {
    plans.push({
      id: baseline.id,
      seasons: baseline.seasons.map((s) => ({
        entry: resolveEntry(pack, s.crop, `baseline ${baseline.id}`),
        ...(s.sowing_doy === undefined ? {} : { sowingDoy: s.sowing_doy }),
      })),
    });
  }

  const drawCount = input.monte_carlo_draws ?? DEFAULT_DRAWS;
  const draws = drawParameters(input.seed, drawCount);
  const cache = new ReplayCache();
  const rotations = plans.map((plan, order): RotationRun => {
    const planned = planRotation(ctx, plan);
    const seasonCount = planned.seasons.length;
    const stride = seasonCount * CRITERIA_COUNT;
    const nominal = new Float64Array(stride);
    const flags = {
      severeWaterStress: new Uint8Array(seasonCount),
      thermalHit: new Uint8Array(seasonCount),
    };
    runRotation(ctx, planned, NOMINAL, cache, nominal, flags);
    const all = new Float64Array(drawCount * stride);
    draws.forEach((params, d) => {
      runRotation(ctx, planned, params, cache, all.subarray(d * stride, (d + 1) * stride));
    });
    return {
      id: plan.id,
      order,
      labels: planned.seasons.map((s) => (ctx.years[s.yearIndex] as { label: string }).label),
      crops: planned.seasons.map((s) => s.entry.id),
      nominal,
      draws: all,
      ...flags,
    };
  });
  return {
    scenarioId: input.scenario.id,
    seed: input.seed,
    drawCount,
    rotations,
    baselineId: baseline?.id ?? null,
  };
}

function band(values: Float64Array): Band {
  const sorted = values.slice().sort();
  return {
    p10: round6(quantileSorted(sorted, 0.1)),
    median: round6(quantileSorted(sorted, 0.5)),
    p90: round6(quantileSorted(sorted, 0.9)),
  };
}

/**
 * Applies priority weights to a replay: composites, contributions, resilience, Monte Carlo bands and
 * the ranking. Cheap enough to run on every slider move because nothing is re-simulated.
 */
export function scoreReplay(run: ReplayRun, priorities: Priorities): EngineOutput {
  const weights = criterionWeights(priorities);
  const scoreOf = (rotation: RotationRun) => {
    const seasons = rotation.labels.length;
    const composites: number[] = [];
    const rows: SeasonResult[] = [];
    const contribution = new Float64Array(CRITERIA_COUNT);
    for (let s = 0; s < seasons; s++) {
      const criteria = Array.from(
        rotation.nominal.subarray(s * CRITERIA_COUNT, (s + 1) * CRITERIA_COUNT),
        round6,
      );
      composite(criteria, weights, contribution);
      const rounded = Array.from(contribution, round6);
      const total = round6(rounded.reduce((a, b) => a + b, 0));
      composites.push(total);
      const row: SeasonResult = {
        season: rotation.labels[s] as string,
        crop: rotation.crops[s] as string,
        criteria: toCriterionValues(criteria),
        composite: total,
        contributions: toCriterionValues(rounded),
      };
      if (run.drawCount > 0) {
        const column = new Float64Array(run.drawCount);
        for (let d = 0; d < run.drawCount; d++) {
          const at = (d * seasons + s) * CRITERIA_COUNT;
          column[d] = composite(rotation.draws.subarray(at, at + CRITERIA_COUNT), weights);
        }
        row.band = band(column);
      }
      rows.push(row);
    }
    return { rotation, composites, rows };
  };

  const scored = run.rotations.map(scoreOf);
  const baseline = scored.find((s) => s.rotation.id === run.baselineId);
  const baselineScores = baseline
    ? new Map(baseline.rows.map((r) => [r.season, r.composite]))
    : null;

  const ranked = scored.map(({ rotation, composites, rows }) => {
    const metrics = resilience({
      composites,
      severeWaterStress: rotation.severeWaterStress,
      thermalHit: rotation.thermalHit,
    });
    const isBaseline = rotation.id === run.baselineId;
    const result: RotationResult = {
      rotation_id: rotation.id,
      seasons: rows as RotationResult["seasons"],
      score: metrics.median,
      contributions: (rows[metrics.medianSeason] as SeasonResult).contributions,
      resilience: {
        median: metrics.median,
        p10: round6(metrics.p10),
        p90: round6(metrics.p90),
        worst: metrics.worst,
        severe_water_stress_seasons: metrics.severeWaterStressSeasons,
        frost_heat_hits: metrics.frostHeatHits,
        win_rate:
          baselineScores && !isBaseline
            ? winRate(new Map(rows.map((r) => [r.season, r.composite])), baselineScores)
            : null,
      },
    };
    if (run.drawCount > 0) result.band = rotationBand(rotation, weights, run.drawCount);
    return {
      result,
      sort: { median: metrics.median, p10: round6(metrics.p10), order: rotation.order },
    };
  });
  ranked.sort((a, b) => compareRanking(a.sort, b.sort));
  return {
    schema: "engine-output/1.0",
    scenario_id: run.scenarioId,
    seed: run.seed,
    results: ranked.map((r) => r.result) as EngineOutput["results"],
  };
}

/** Band of the rotation score (the lower-median season composite) across the draws. */
function rotationBand(rotation: RotationRun, weights: Float64Array, draws: number): Band {
  const seasons = rotation.labels.length;
  const scores = new Float64Array(draws);
  const row = new Float64Array(seasons);
  for (let d = 0; d < draws; d++) {
    for (let s = 0; s < seasons; s++) {
      const at = (d * seasons + s) * CRITERIA_COUNT;
      row[s] = composite(rotation.draws.subarray(at, at + CRITERIA_COUNT), weights);
    }
    scores[d] = row.slice().sort()[lowerMedianIndex(seasons)] as number;
  }
  return band(scores);
}
