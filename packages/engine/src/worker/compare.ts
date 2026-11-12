import {
  type EngineInput,
  type EngineOutput,
  type FieldBundle,
  type Priorities,
  type Rotation,
  validate,
} from "../contracts";
import {
  buildEvidenceCards,
  type CandidateResult,
  designReport,
  type Exclusion,
  explainExclusion,
  generateCandidates,
  palette,
  parseProjection,
  projectionScenario,
  projectionShifts,
  seasonClimate,
} from "../decisions";
import { BARE_PROFILE_M, cropCurves, toDayNumber, toIsoDate } from "../physics";
import {
  canopyCurve,
  createReplayWorld,
  monthlyCover,
  nominalTimeline,
  planOf,
  planRotation,
  REPLAY_LABEL,
  type ReplayRun,
  type ReplayWorld,
  scoreReplay,
  simulateRotations,
} from "../replay";
import type {
  ClimateRow,
  CompareRequest,
  CompareResult,
  DesignRequest,
  DesignResult,
  FutureRequest,
  FutureResult,
  LaneTimeline,
  SeasonScore,
  TimelineResult,
  Weighted,
} from "./compareTypes";
import { ReplayRequestError } from "./handler";

const DEFAULT_TOP_N = 4;
const MAX_SHOWN_ERRORS = 5;
const NDVI_CADENCE_DAYS = 16;

function check(result: { ok: true } | { ok: false; errors: string[] }, what: string): void {
  if (!result.ok) {
    const shown = result.errors.slice(0, MAX_SHOWN_ERRORS).join("; ");
    throw new ReplayRequestError(`${what} does not match its schema: ${shown}`, "ValidationError");
  }
}

interface Session {
  bundle: FieldBundle;
  input: EngineInput;
  world: ReplayWorld;
  run: ReplayRun;
  found: CandidateResult;
  rotations: Map<string, Rotation>;
  groundTruth: CompareRequest["groundTruth"];
  packId?: string;
  /** History replay without Monte Carlo, the reference of every 2050 shift; computed once. */
  history?: EngineOutput;
}

/** Seasons every replayed rotation covers, with the mean composite of the rotations in each. */
function seasonScores(output: EngineOutput): SeasonScore[] {
  const counts = new Map<string, { sum: number; n: number }>();
  for (const result of output.results) {
    for (const s of result.seasons) {
      const entry = counts.get(s.season) ?? { sum: 0, n: 0 };
      counts.set(s.season, { sum: entry.sum + s.composite, n: entry.n + 1 });
    }
  }
  return [...counts]
    .filter(([, c]) => c.n === output.results.length)
    .map(([label, c]) => ({ label, meanScore: c.sum / c.n }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * One comparison at a time: candidates, replay, cards and the day-by-day replay of any season, all
 * from the last `compare`. State lives here so the page only moves results, not simulations.
 */
export function createCompareSession() {
  let session: Session | null = null;

  const weighted = (s: Session, priorities: Priorities): Weighted => {
    const input = { ...s.input, priorities };
    check(validate("engine-input", input), "Priorities");
    const output = scoreReplay(s.run, priorities);
    check(validate("engine-output", output), "Engine output");
    const cards = buildEvidenceCards({
      bundle: s.bundle,
      input,
      output,
      rotations: [...s.rotations.values()],
      ...(s.groundTruth ? { groundTruth: s.groundTruth } : {}),
    });
    const seasons = seasonScores(output);
    const worst = seasons.reduce<SeasonScore | null>(
      (low, c) => (low === null || c.meanScore < low.meanScore ? c : low),
      null,
    );
    s.input = input;
    return { output, cards, seasons, worstSeason: worst?.label ?? null };
  };

  return {
    compare(request: CompareRequest, packId?: string): CompareResult {
      const { bundle } = request;
      check(validate("field-bundle", bundle), "Field bundle");
      const baseline = request.input.baseline;
      const seed = {
        ...request.input,
        rotations: [baseline ?? { id: "none", seasons: [{ crop: "fallow" }] }],
      } as EngineInput;
      check(validate("engine-input", seed), "Engine input");
      const found = generateCandidates(
        { bundle, input: seed, ...(packId ? { packId } : {}) },
        { topN: request.topN ?? DEFAULT_TOP_N },
      );
      const rotations = new Map(found.candidates.map((c) => [c.rotation.id, c.rotation]));
      const alternatives = found.candidates.filter((c) => !c.isBaseline).map((c) => c.rotation);
      const designs = (request.designs ?? []).map((d) => ({ ...d, name: d.name ?? d.id }));
      for (const design of designs) {
        check(validate("engine-input", { ...seed, rotations: [design] }), "Design");
        if (rotations.has(design.id)) {
          throw new ReplayRequestError(`Design id "${design.id}" is already a rotation`);
        }
        rotations.set(design.id, design);
      }
      const base = alternatives.length > 0 ? alternatives : baseline ? [baseline] : [];
      const replayed = [...base, ...designs];
      if (replayed.length === 0) {
        throw new ReplayRequestError(
          "No rotation to compare: none is allowed and none is set as current",
        );
      }
      const input = {
        ...request.input,
        rotations: replayed as EngineInput["rotations"],
      } as EngineInput;
      check(validate("engine-input", input), "Engine input");

      const world = createReplayWorld({ bundle, input, ...(packId ? { packId } : {}) });
      const plans = replayed.map((r) => planOf(world.pack, r));
      if (baseline && !replayed.some((r) => r.id === baseline.id)) {
        plans.push(planOf(world.pack, baseline, "baseline"));
        rotations.set(baseline.id, baseline);
      }
      const run = simulateRotations(world.ctx, plans, {
        seed: input.seed,
        drawCount: input.monte_carlo_draws ?? 200,
        scenarioId: input.scenario.id,
        baselineId: baseline?.id ?? null,
      });
      session = {
        bundle,
        input,
        world,
        run,
        found,
        rotations,
        groundTruth: request.groundTruth,
        ...(packId ? { packId } : {}),
      };
      const result = weighted(session, input.priorities);
      return {
        ...result,
        rotations: [...rotations.values()].map((r) => ({
          id: r.id,
          name:
            r.name ??
            planOf(world.pack, r)
              .seasons.map((s) => s.entry.name)
              .join(", "),
        })),
        definitions: [...rotations.values()],
        baselineId: baseline?.id ?? null,
        packId: found.packId,
        palette: palette(world.pack),
        leftOut: found.exclusions.map((e) => ({
          crop: e.crop,
          name: found.names[e.crop] ?? e.crop,
          filter: e.filter,
          reason: e.reason,
        })),
        gaps: found.gaps,
        label: REPLAY_LABEL,
      };
    },

    reweigh(priorities: Priorities): Weighted {
      if (!session) throw new ReplayRequestError("Call compare before reweigh");
      return weighted(session, priorities);
    },

    whyNot(crop: string): Exclusion {
      if (!session) throw new ReplayRequestError("Call compare before whyNot");
      return explainExclusion(session.found, crop);
    },

    future(request: FutureRequest): FutureResult {
      if (!session) throw new ReplayRequestError("Call compare before future");
      const s = session;
      const progress = request.progress ?? 1;
      if (!(progress >= 0 && progress <= 1)) {
        throw new ReplayRequestError("progress must be between 0 and 1", "ValidationError");
      }
      let payload: ReturnType<typeof parseProjection>;
      try {
        payload = parseProjection(request.payload);
      } catch (error) {
        throw new ReplayRequestError((error as Error).message, "ValidationError");
      }
      const ssps = request.ssps ?? Object.keys(payload.scenarios);
      const noDraws = { ...s.input, monte_carlo_draws: 0 };
      s.history ??= scoreReplay(
        simulateRotations(
          s.world.ctx,
          [...s.run.rotations].flatMap((r) => {
            const rotation = s.rotations.get(r.id);
            return rotation ? [planOf(s.world.pack, rotation)] : [];
          }),
          {
            seed: noDraws.seed,
            drawCount: 0,
            scenarioId: "history",
            baselineId: s.run.baselineId,
          },
        ),
        s.input.priorities,
      );
      const shifts = projectionShifts({
        bundle: s.bundle,
        input: { ...noDraws, rotations: [...s.rotations.values()] as EngineInput["rotations"] },
        payload,
        ssps,
        progress,
        history: s.history,
        ...(s.packId ? { packId: s.packId } : {}),
      });
      const climate: ClimateRow[] = [
        {
          id: "today",
          seasons: seasonClimate(s.bundle, { id: "history", kind: "history" }, s.packId),
        },
        ...ssps.map((ssp) => ({
          id: ssp,
          seasons: seasonClimate(
            s.bundle,
            projectionScenario(payload, ssp, "median", progress),
            s.packId,
          ),
        })),
      ];
      return { ...shifts, progress, climate };
    },

    design(request: DesignRequest): DesignResult {
      if (!session) throw new ReplayRequestError("Call compare before design");
      const { world, bundle, input } = session;
      const rotation = {
        id: "design",
        seasons: request.crops.map((crop) => ({ crop })),
      } as Rotation;
      check(validate("engine-input", { ...input, rotations: [rotation] }), "Design");
      try {
        return designReport({
          world,
          rotation,
          constraints: input.constraints,
          latitude: bundle.field.centroid[1],
        });
      } catch (error) {
        if (error instanceof RangeError) throw new ReplayRequestError(error.message);
        throw error;
      }
    },

    timeline(season: string): TimelineResult {
      if (!session) throw new ReplayRequestError("Call compare before timeline");
      const { world, run, bundle, rotations } = session;
      const { ctx, pack } = world;
      const yearIndex = ctx.years.findIndex((y) => y.label === season);
      const year = ctx.years[yearIndex];
      if (!year) throw new ReplayRequestError(`Season ${season} is not in the replayed record`);
      const first = year.startDay - ctx.forcing.startDay;
      const days = year.endDay - year.startDay;
      const spans = ctx.spans[yearIndex] as NonNullable<(typeof ctx.spans)[number]>;
      const awc = ctx.soil.awcMmPerM;

      const lanes: LaneTimeline[] = [];
      const output = scoreReplay(run, session.input.priorities);
      for (const rotationRun of run.rotations) {
        const rotation = rotations.get(rotationRun.id);
        if (!rotation) continue;
        const planned = planRotation(ctx, planOf(pack, rotation));
        const seasonPlan = planned.seasons.find((s) => s.yearIndex === yearIndex);
        if (!seasonPlan) continue;
        const timeline = nominalTimeline(ctx, planned);
        const crop = seasonPlan.crop;
        const curves = crop ? cropCurves(crop) : null;
        const canopy = crop ? canopyCurve(crop) : null;
        const monthly = monthlyCover(seasonPlan.entry, seasonPlan.sowingDay, spans, canopy);
        const soilWater: number[] = [];
        const stress: number[] = [];
        const cover: number[] = [];
        const stage: number[] = [];
        for (let d = 0; d < days; d++) {
          const i = first + d;
          const dayNumber = year.startDay + d;
          const age = dayNumber - seasonPlan.sowingDay;
          const growing = curves !== null && age >= 0 && age < curves.kc.length;
          const zr = growing ? (curves.zr[age] as number) : BARE_PROFILE_M;
          const taw = awc * zr;
          const dr = (timeline.dr[i] as number) ?? 0;
          soilWater.push(taw > 0 ? Math.min(1, Math.max(0, 1 - dr / taw)) : 0);
          stress.push(growing ? Math.min(1, Math.max(0, 1 - (timeline.ks[i] as number))) : 0);
          const monthIndex = spans.findIndex((m) => dayNumber >= m.start && dayNumber < m.end);
          cover.push(
            growing && canopy ? (canopy[age] as number) : ((monthly[monthIndex] as number) ?? 0),
          );
          stage.push(growing ? (timeline.stage[i] as number) : -1);
        }
        lanes.push({
          rotation_id: rotationRun.id,
          name: rotation.name ?? rotation.id,
          crop: crop?.id ?? seasonPlan.entry.id,
          soilWater,
          stress,
          cover,
          stage,
        });
      }

      const rain = Array.from({ length: days }, (_, d) => ctx.forcing.precip[first + d] as number);
      const scores = output.results.flatMap((r) => {
        const s = r.seasons.find((x) => x.season === season);
        return s
          ? [{ rotation_id: r.rotation_id, composite: s.composite, band: s.band ?? null }]
          : [];
      });
      return {
        season,
        startDate: toIsoDate(year.startDay),
        days,
        rain,
        ndvi: observedNdvi(bundle, year.startDay, year.endDay),
        lanes,
        scores,
      };
    },
  };
}

/** Observed NDVI points of the bundle inside a window of day numbers. */
function observedNdvi(
  bundle: FieldBundle,
  from: number,
  to: number,
): { date: string; value: number }[] {
  const series = bundle.series.find((s) => s.var === "ndvi");
  if (!series) return [];
  const step = series.cadence === "16day" ? NDVI_CADENCE_DAYS : 1;
  const start = toDayNumber(series.start);
  const points: { date: string; value: number }[] = [];
  series.values.forEach((value, k) => {
    const day = start + k * step;
    if (value !== null && series.quality[k] !== 2 && day >= from && day < to) {
      points.push({ date: toIsoDate(day), value });
    }
  });
  return points;
}
