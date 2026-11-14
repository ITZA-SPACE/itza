import type { CropEntry, PestEntry } from "@itza/knowledge";
import type { EngineInput, FieldBundle, Rotation } from "../contracts";
import {
  createReplayWorld,
  nitrogenScore,
  organicMatterScore,
  planOf,
  planRotation,
  type RotationPlan,
  scoreReplay,
  simulateRotations,
} from "../replay";
import {
  type ClimateFacts,
  type CropExclusion,
  climateFacts,
  climateHit,
  constraintHit,
  unknownEquipmentLimits,
} from "./constraints";

export interface CandidateOptions {
  /** Alternatives to keep besides the baseline. Default 6. */
  topN?: number;
  minLength?: number;
  maxLength?: number;
  /** Most sequences replayed to rank them. Default 500. */
  maxScored?: number;
}

export interface Candidate {
  rotation: Rotation;
  isBaseline: boolean;
  /** Hard rules the rotation breaks; only the farmer's current rotation may have any. */
  violations: string[];
  /** Crop families of the seasons, sorted: the composition used for diversity. */
  families: string[];
  /** Median composite of the replay and its P10, with the priorities of the input. */
  score: number;
  p10: number;
  /** 1-based rank among the scored alternatives; null for the baseline. */
  rank: number | null;
}

export interface CandidateResult {
  /** The baseline first when there is one, then the alternatives from best to worst. */
  candidates: Candidate[];
  /** Crop ids that passed every crop-level filter. */
  feasibleCrops: string[];
  /** Why each other crop is not in the candidates. */
  exclusions: CropExclusion[];
  /** Rotation sequences replayed to rank them. */
  considered: number;
  /** Things the generator could not check. */
  gaps: string[];
  /** Crop names by id, for explanations. */
  names: Record<string, string>;
  packId: string;
}

const DEFAULTS = { topN: 6, minLength: 2, maxLength: 5, maxScored: 500 } as const;
const MAX_REPEATS = 2;

interface PestBreak {
  pest: PestEntry;
  crop: CropEntry;
  /** Seasons between two plantings of the crop (cyclic), the smallest found. */
  breakSeasons: number;
}

function hosts(pest: PestEntry, crop: CropEntry): boolean {
  if (pest.hosts.crops.includes(crop.id)) return true;
  return crop.kind !== "fallow" && pest.hosts.families.includes(crop.family);
}

/** The pest that sets how long a crop must stay away from the field, and that many seasons. */
function strictestBreak(
  pests: readonly PestEntry[],
  crop: CropEntry,
): { pest: PestEntry; seasons: number } | null {
  let strictest: { pest: PestEntry; seasons: number } | null = null;
  for (const pest of pests) {
    if (!hosts(pest, crop)) continue;
    const seasons = pest.min_break_years.value;
    if (!strictest || seasons > strictest.seasons) strictest = { pest, seasons };
  }
  return strictest;
}

/**
 * Crops that come back to the field sooner than the strictest pest of that crop allows. This is the
 * hard rule: the seasons between two plantings of the same crop, counted around the repeating
 * cycle, must be at least the pest's `min_break_years` (a single sunflower season in a rotation of N
 * seasons has a break of N - 1). Pressure from other crops of the same family is not a hard rule; it
 * is scored (pest pressure criterion).
 */
export function pestBreakViolations(
  pests: readonly PestEntry[],
  sequence: readonly CropEntry[],
): PestBreak[] {
  const n = sequence.length;
  const found: PestBreak[] = [];
  for (const crop of new Set(sequence)) {
    const rule = strictestBreak(pests, crop);
    if (!rule) continue;
    const positions = sequence.flatMap((c, i) => (c === crop ? [i] : []));
    let smallest = Number.POSITIVE_INFINITY;
    positions.forEach((p, k) => {
      const next = positions[(k + 1) % positions.length] as number;
      const gap = positions.length === 1 ? n : (((next - p) % n) + n) % n;
      smallest = Math.min(smallest, gap - 1);
    });
    if (smallest < rule.seasons) found.push({ pest: rule.pest, crop, breakSeasons: smallest });
  }
  return found;
}

/** The sequence is the smallest of its rotations and not a repetition of a shorter one. */
function isCanonical(indices: readonly number[]): boolean {
  const n = indices.length;
  for (let r = 1; r < n; r++) {
    for (let k = 0; k < n; k++) {
      const a = indices[(r + k) % n] as number;
      const b = indices[k] as number;
      if (a !== b) {
        if (a < b) return false;
        break;
      }
      if (k === n - 1) return false;
    }
  }
  return true;
}

/** A harvested season: a crop, as opposed to fallow or a cover crop. */
const isHarvested = (crop: CropEntry): boolean => crop.kind === "crop";

/**
 * Every repeating sequence of `minLength` to `maxLength` seasons over `crops` that respects the pest
 * break intervals. Rotations of the same cycle appear once (in canonical order). Structural rules: a
 * crop appears at most twice, fallow and cover crops at most once each, and at least one season is a
 * harvested crop, so a rotation always grows something.
 */
export function enumerateSequences(
  crops: readonly CropEntry[],
  pests: readonly PestEntry[],
  minLength: number,
  maxLength: number,
): CropEntry[][] {
  // Per crop index: seasons it must stay away between plantings, whether it is harvested, its use limit.
  const away = crops.map((c) => strictestBreak(pests, c)?.seasons ?? 0);
  const harvested = crops.map(isHarvested);
  const limit = crops.map((c) => (isHarvested(c) ? MAX_REPEATS : 1));
  const out: CropEntry[][] = [];
  const indices: number[] = [];
  const used = new Array<number>(crops.length).fill(0);
  let harvestedCount = 0;

  const returnsTooSoon = (): boolean => {
    const n = indices.length;
    for (let p = 0; p < n; p++) {
      const idx = indices[p] as number;
      const need = away[idx] as number;
      if (need === 0) continue;
      let gap = n;
      for (let q = 1; q < n; q++) {
        if (indices[(p + q) % n] === idx) {
          gap = q;
          break;
        }
      }
      if (gap - 1 < need) return true;
    }
    return false;
  };

  const walk = () => {
    const n = indices.length;
    if (n >= minLength && harvestedCount >= 1 && isCanonical(indices) && !returnsTooSoon()) {
      out.push(indices.map((i) => crops[i] as CropEntry));
    }
    if (n === maxLength) return;
    for (let i = indices[0] ?? 0; i < crops.length; i++) {
      if ((used[i] as number) >= (limit[i] as number)) continue;
      const need = away[i] as number;
      let tooSoon = false;
      for (let k = n - 1; need > 0 && k >= 0 && n - k - 1 < need; k--) {
        if (indices[k] === i) {
          tooSoon = true;
          break;
        }
      }
      if (tooSoon) continue;
      indices.push(i);
      used[i] = (used[i] as number) + 1;
      if (harvested[i]) harvestedCount++;
      walk();
      if (harvested[i]) harvestedCount--;
      used[i] = (used[i] as number) - 1;
      indices.pop();
    }
  };
  walk();
  return out;
}

/** Weather-free score of a sequence, used only to choose which sequences are worth replaying. */
function staticScore(sequence: readonly CropEntry[]): number {
  const n = sequence.length;
  let total = 0;
  sequence.forEach((crop, j) => {
    const previous = sequence[(j - 1 + n) % n] as CropEntry;
    total +=
      nitrogenScore(previous.n_credit_kg_ha.value) +
      organicMatterScore(crop) +
      crop.cover_months.value / 12 +
      0.5 * crop.forage_value.value +
      0.5 * (crop.market_flag.value ? 1 : 0);
  });
  return total / n;
}

const familyOf = (crop: CropEntry): string => (crop.kind === "fallow" ? "fallow" : crop.family);

function rotationOf(sequence: readonly CropEntry[], taken: Set<string>): Rotation {
  let id = sequence.map((c) => c.id.slice(0, 11)).join("-");
  for (let k = 2; taken.has(id); k++) id = `${id.slice(0, 58)}-${k}`;
  taken.add(id);
  return {
    id,
    name: sequence
      .map((c) => c.name)
      .join(", ")
      .slice(0, 80),
    seasons: sequence.map((c) => ({ crop: c.id })) as Rotation["seasons"],
  };
}

function baselineViolations(
  sequence: readonly CropEntry[],
  constraints: EngineInput["constraints"],
  facts: ClimateFacts,
  pests: readonly PestEntry[],
): string[] {
  const reasons: string[] = [];
  for (const crop of new Set(sequence)) {
    const hit = constraintHit(crop, constraints) ?? climateHit(crop, facts);
    if (hit) reasons.push(hit.reason);
  }
  for (const { pest, crop, breakSeasons } of pestBreakViolations(pests, sequence)) {
    reasons.push(
      `${crop.name} returns after ${breakSeasons} season${breakSeasons === 1 ? "" : "s"} away; ${pest.name} needs ${pest.min_break_years.value}.`,
    );
  }
  return reasons;
}

export interface CandidateRequest {
  bundle: FieldBundle;
  input: EngineInput;
  packId?: string;
}

/**
 * Generates the rotation candidates (F-06): crops are filtered by the farmer's hard constraints and
 * the field's climate, sequences of 2 to 5 seasons are enumerated with the pest break intervals as a
 * hard rule, the best are replayed to rank them, and `topN` are kept, varied by family composition.
 * The farmer's current rotation is always included as the baseline.
 */
export function generateCandidates(
  { bundle, input, packId }: CandidateRequest,
  options: CandidateOptions = {},
): CandidateResult {
  const { topN, minLength, maxLength, maxScored } = { ...DEFAULTS, ...options };
  const { pack, ctx } = createReplayWorld({ bundle, input, ...(packId ? { packId } : {}) });
  const latitude = bundle.field.centroid[1];
  const facts = climateFacts(ctx, pack.crops, latitude);
  const names = Object.fromEntries(pack.crops.map((c) => [c.id, c.name]));

  const exclusions: CropExclusion[] = [];
  const usable: CropEntry[] = [];
  for (const crop of pack.crops) {
    const hit = constraintHit(crop, input.constraints) ?? climateHit(crop, facts);
    if (hit) exclusions.push(hit);
    else usable.push(crop);
  }

  const sequences = enumerateSequences(usable, pack.pests, minLength, maxLength);
  const present = new Set(sequences.flatMap((s) => s.map((c) => c.id)));
  for (const crop of usable) {
    if (present.has(crop.id)) continue;
    const rule = strictestBreak(pack.pests, crop);
    exclusions.push({
      crop: crop.id,
      filter: "pest_break",
      reason: rule
        ? `${crop.name} must stay away for ${rule.seasons} season${rule.seasons === 1 ? "" : "s"} between plantings because of ${rule.pest.name}, which a rotation of ${minLength} to ${maxLength} seasons with the other allowed crops cannot provide.`
        : `${crop.name} cannot be combined with the other allowed crops in a rotation of ${minLength} to ${maxLength} seasons.`,
    });
  }

  const baselinePlan = input.baseline ? planOf(pack, input.baseline, "baseline") : null;
  const baselineSequence = baselinePlan ? baselinePlan.seasons.map((s) => s.entry) : null;

  const ranked = [...sequences]
    .map((sequence, order) => ({ sequence, order, base: staticScore(sequence) }))
    .sort((a, b) => b.base - a.base || a.order - b.order)
    .slice(0, maxScored);

  const taken = new Set<string>(input.baseline ? [input.baseline.id] : []);
  const entries = ranked.map(({ sequence }) => ({
    sequence,
    rotation: rotationOf(sequence, taken),
  }));
  const scorable: { sequence: CropEntry[]; rotation: Rotation; plan: RotationPlan }[] = [];
  for (const entry of entries) {
    const plan = planOf(pack, entry.rotation);
    try {
      planRotation(ctx, plan);
      scorable.push({ ...entry, plan });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }

  const plans = scorable.map((c) => c.plan);
  if (baselinePlan) plans.push(baselinePlan);
  const sequenceOf = new Map(scorable.map((c) => [c.rotation.id, c.sequence]));
  const scoredRun = simulateRotations(ctx, plans, {
    seed: input.seed,
    drawCount: 0,
    scenarioId: input.scenario.id,
    baselineId: baselinePlan?.id ?? null,
  });
  const output = scoreReplay(scoredRun, input.priorities);
  const scoreOf = new Map(output.results.map((r) => [r.rotation_id, r.resilience]));
  const orderOf = new Map(output.results.map((r, i) => [r.rotation_id, i]));

  const alternatives = scorable
    .map((c): Candidate => {
      const r = scoreOf.get(c.rotation.id) as NonNullable<ReturnType<typeof scoreOf.get>>;
      return {
        rotation: c.rotation,
        isBaseline: false,
        violations: [],
        families: c.sequence.map(familyOf).sort(),
        score: r.median,
        p10: r.p10,
        rank: null,
      };
    })
    .sort(
      (a, b) => (orderOf.get(a.rotation.id) as number) - (orderOf.get(b.rotation.id) as number),
    );
  alternatives.forEach((c, i) => {
    c.rank = i + 1;
  });

  const baselineKey = baselineSequence ? cycleKey(baselineSequence) : null;
  const eligible = alternatives.filter(
    (c) =>
      baselineKey === null ||
      cycleKey(sequenceOf.get(c.rotation.id) as CropEntry[]) !== baselineKey,
  );
  const chosen = diverse(eligible, topN);

  const candidates: Candidate[] = [];
  if (input.baseline && baselineSequence) {
    const r = scoreOf.get(input.baseline.id) as NonNullable<ReturnType<typeof scoreOf.get>>;
    candidates.push({
      rotation: input.baseline,
      isBaseline: true,
      violations: baselineViolations(baselineSequence, input.constraints, facts, pack.pests),
      families: baselineSequence.map(familyOf).sort(),
      score: r.median,
      p10: r.p10,
      rank: null,
    });
  }
  candidates.push(...chosen);

  const shown = new Set(
    candidates.flatMap((c) =>
      (sequenceOf.get(c.rotation.id) ?? baselineSequence ?? []).map((crop) => crop.id),
    ),
  );
  for (const crop of usable) {
    if (shown.has(crop.id) || !present.has(crop.id)) continue;
    const best = alternatives.find((c) =>
      (sequenceOf.get(c.rotation.id) as CropEntry[]).some((x) => x.id === crop.id),
    );
    exclusions.push({
      crop: crop.id,
      filter: "not_selected",
      reason: best
        ? `${crop.name} is allowed, but the best rotation that includes it ranks ${best.rank} of ${alternatives.length} (score ${best.score.toFixed(2)}) and was left out in favour of ${topN} higher-scoring or more varied rotations.`
        : `${crop.name} is allowed, but only appears in rotations that were not among the ${maxScored} replayed.`,
    });
  }

  const gaps = unknownEquipmentLimits(input.constraints).map(
    (limit) =>
      `The equipment limit "${limit}" was not applied: the crop packs have no machinery data for it.`,
  );
  return {
    candidates,
    feasibleCrops: usable.map((c) => c.id),
    exclusions,
    considered: scorable.length,
    gaps,
    names,
    packId: pack.id,
  };
}

/** Same cycle in any rotation gives the same key. */
function cycleKey(sequence: readonly CropEntry[]): string {
  const ids = sequence.map((c) => c.id);
  const n = ids.length;
  const rotations = ids.map((_, r) => ids.map((__, k) => ids[(r + k) % n]).join("|"));
  return rotations.sort()[0] as string;
}

/** The best `n` alternatives with a different family composition first, then the best of the rest. */
function diverse(ranked: readonly Candidate[], n: number): Candidate[] {
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of ranked) {
    if (picked.length === n) break;
    const key = c.families.join("+");
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
  }
  for (const c of ranked) {
    if (picked.length === n) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.sort((a, b) => (a.rank as number) - (b.rank as number));
}

export interface Exclusion {
  crop: string;
  excluded: boolean;
  reason: string;
}

/** Why a crop is, or is not, among the candidates: the filter or ranking that decided it. */
export function explainExclusion(result: CandidateResult, crop: string): Exclusion {
  const name = result.names[crop];
  if (name === undefined) {
    return { crop, excluded: true, reason: `${crop} is not in the ${result.packId} crop list.` };
  }
  const including = result.candidates.filter((c) =>
    c.rotation.seasons.some((s) => s.crop === crop),
  );
  if (including.length > 0) {
    return {
      crop,
      excluded: false,
      reason: `${name} is in ${including.map((c) => c.rotation.name ?? c.rotation.id).join("; ")}.`,
    };
  }
  const hit = result.exclusions.find((e) => e.crop === crop);
  return {
    crop,
    excluded: true,
    reason: hit?.reason ?? `${name} is not in any of the candidate rotations.`,
  };
}
