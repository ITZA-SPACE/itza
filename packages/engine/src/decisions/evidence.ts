import type { CropEntry } from "@itza/knowledge";
import type {
  CriterionValues,
  EngineInput,
  EngineOutput,
  EvidenceCard,
  EvidenceItem,
  FieldBundle,
  Rotation,
  RotationResult,
} from "../contracts";
import { isCrop, soilParams } from "../physics";
import { CRITERIA, createReplayWorld, planOf, type ReplayWorld } from "../replay";
import { pestBreakViolations } from "./candidates";
import {
  type ConfidenceResult,
  confidenceFor,
  type GroundTruth,
  modelSatelliteAgreement,
  observedSoilSources,
  scaleOf,
  traitConfidence,
} from "./confidence";
import { unknownEquipmentLimits } from "./constraints";
import {
  benefitText,
  criterionLabel,
  distance,
  gapText,
  headlineText,
  riskText,
  sourceName,
  whyText,
} from "./templates";

const MAX_TEXT = 400;
const MAX_BENEFITS = 5;
/** A criterion counts as a benefit when its mean beats the baseline by at least this much. */
const BENEFIT_MARGIN = 0.05;
/** A criterion counts as a strength of its own from this mean. */
const STRENGTH_FROM = 0.6;
/** Low-confidence share of a crop's traits from which it is listed as an information gap. */
const TRAIT_GAP_FROM = 0.4;
const FROST_RISK_FROM = 0.2;

const clip = (text: string): string =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
const unique = (items: string[]): string[] => [...new Set(items)];

/** Mean of each criterion over the seasons of a rotation. */
function meanBy(
  result: RotationResult,
  pick: (s: RotationResult["seasons"][number]) => CriterionValues,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of CRITERIA) {
    out[name] = result.seasons.reduce((sum, s) => sum + pick(s)[name], 0) / result.seasons.length;
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface EvidenceCardInput {
  bundle: FieldBundle;
  input: EngineInput;
  world: ReplayWorld;
  rotation: Rotation;
  result: RotationResult;
  baseline: RotationResult | null;
  confidence: ConfidenceResult;
  /** Disagreements found by the Model Arena (#38); shown as risks needing local review. */
  arenaDisagreements?: readonly string[];
}

function provenanceOf(bundle: FieldBundle, world: ReplayWorld, seasons: RotationResult["seasons"]) {
  const precip = bundle.series.find((s) => s.var === "precip" && s.cadence === "daily");
  const scale = scaleOf(bundle);
  const first = seasons[0]?.season ?? "";
  const last = seasons[seasons.length - 1]?.season ?? "";
  return {
    source: `ITZA season replay on ${sourceName(precip?.provenance.source ?? scale.source)}`,
    resolution: `${distance(scale.resolutionM)} weather cell`,
    period: `${first} to ${last} (${seasons.length} seasons)`,
    seasons: seasons.length,
    usable: world.ctx.years.length,
  };
}

function evidenceItems(
  p: ReturnType<typeof provenanceOf>,
  result: RotationResult,
  baseline: RotationResult | null,
  isBaseline: boolean,
  input: EngineInput,
): EvidenceItem[] {
  const r = result.resilience;
  const b = baseline?.resilience ?? null;
  const total = result.seasons.length;
  const none = isBaseline ? "this is your current rotation" : "no current rotation to compare with";
  const items: EvidenceItem[] = [
    {
      indicator: "Median season score",
      value: round2(result.score),
      comparison: b ? `${round2(b.median)} for your current rotation` : none,
      source: p.source,
      resolution: p.resolution,
      period: p.period,
    },
    {
      indicator: "Seasons with severe water stress",
      value: `${r.severe_water_stress_seasons} of ${total}`,
      comparison:
        b && baseline
          ? `${b.severe_water_stress_seasons} of ${baseline.seasons.length} for your current rotation`
          : none,
      source: p.source,
      resolution: p.resolution,
      period: p.period,
    },
    {
      indicator: "Score in the worst season",
      value: round2(r.worst),
      comparison: b ? `${round2(b.worst)} for your current rotation` : none,
      source: p.source,
      resolution: p.resolution,
      period: p.period,
    },
  ];
  if (r.win_rate !== null) {
    items.push({
      indicator: "Seasons that beat your current rotation",
      value: `${Math.round(r.win_rate * total)} of ${total}`,
      comparison: "same weather, same priorities",
      source: p.source,
      resolution: p.resolution,
      period: p.period,
    });
  }
  const awc = input.soil.awc_mm_per_m;
  if (awc) {
    items.push({
      indicator: "Plant-available water in the soil",
      value: `${Math.round(awc.value)} mm per metre`,
      comparison: "sets how much rain the soil can hold for the crop",
      source: sourceName(awc.source),
      resolution: "soil grid cell or your own test",
      period: "static",
    });
  }
  return items;
}

function whyOf(
  result: RotationResult,
  baseline: RotationResult | null,
  isBaseline: boolean,
): string {
  if (isBaseline) return whyText.baseline(result.score);
  if (!baseline) return whyText.alone(result.score);
  // The same contributions the card's bar shows (the median season), so the reasons match it.
  const mine = result.contributions;
  const theirs = baseline.contributions;
  const gains = CRITERIA.map((name) => ({
    name,
    delta: (mine[name] as number) - (theirs[name] as number),
  }))
    .filter((g) => g.delta > 0.002)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((g) => criterionLabel[g.name]);
  return result.score >= baseline.score
    ? whyText.better(result.score, baseline.score, gains)
    : whyText.worse(result.score, baseline.score, gains);
}

function benefitsOf(
  result: RotationResult,
  baseline: RotationResult | null,
  crops: readonly CropEntry[],
  livestock: boolean,
): string[] {
  const mine = meanBy(result, (s) => s.criteria);
  const theirs = baseline ? meanBy(baseline, (s) => s.criteria) : null;
  const out: string[] = [];
  const ranked = CRITERIA.map((name) => ({
    name,
    value: mine[name] as number,
    base: theirs ? (theirs[name] as number) : null,
  }));
  const wins = theirs
    ? ranked
        .filter((c) => c.value - (c.base as number) >= BENEFIT_MARGIN)
        .sort((a, b) => b.value - (b.base as number) - (a.value - (a.base as number)))
    : ranked.filter((c) => c.value >= STRENGTH_FROM).sort((a, b) => b.value - a.value);
  for (const c of wins.slice(0, 3))
    out.push(
      benefitText.better(
        criterionLabel[c.name],
        round2(c.value),
        c.base === null ? null : round2(c.base),
      ),
    );

  const unique1 = [...new Set(crops)];
  const nitrogen = unique1
    .filter((c) => c.n_credit_kg_ha.value > 0)
    .sort((a, b) => b.n_credit_kg_ha.value - a.n_credit_kg_ha.value)[0];
  if (nitrogen) out.push(benefitText.nitrogen(nitrogen.name, nitrogen.n_credit_kg_ha.value));
  if (unique1.some((c) => c.kind === "fallow")) out.push(benefitText.fallow);
  const coverMonths = Math.round((mine.bare_exposure as number) * 12);
  if (coverMonths >= 6) out.push(benefitText.cover(coverMonths));
  const forage = unique1.find((c) => c.kind === "crop" && c.forage_value.value >= 0.5);
  if (forage && livestock) out.push(benefitText.forage(forage.name));
  if (out.length === 0) out.push(benefitText.generic(round2(result.score), result.seasons.length));
  return out.slice(0, MAX_BENEFITS);
}

function gapsOf(
  args: EvidenceCardInput,
  crops: readonly CropEntry[],
  agreementKnown: boolean,
): string[] {
  const { bundle, input, world, result } = args;
  const gaps: string[] = bundle.gaps.map((g) => gapText.bundle(g.var, g.reason.replace(/\.$/, "")));
  const scale = scaleOf(bundle);
  if (scale.ratio >= 10)
    gaps.push(gapText.scale(scale.resolutionM, scale.source, bundle.field.area_ha));
  const lowTraits = unique(
    crops.flatMap((c) => {
      const t = traitConfidence(world.pack, [c]);
      return t && t.lowShare >= TRAIT_GAP_FROM ? [c.name] : [];
    }),
  );
  if (lowTraits.length > 0) gaps.push(gapText.traits(lowTraits));
  if (observedSoilSources(input.soil).length === 0) {
    const source =
      input.soil.awc_mm_per_m?.source ?? input.soil.clay_pct?.source ?? "a regional default";
    gaps.push(gapText.noSoilTest(source));
  }
  if (!agreementKnown) gaps.push(gapText.noSatellite);
  if (result.seasons.length < world.ctx.years.length) {
    gaps.push(
      gapText.skippedSeasons(
        args.rotation.name ?? args.rotation.id,
        result.seasons.length,
        world.ctx.years.length,
      ),
    );
  }
  for (const limit of unknownEquipmentLimits(input.constraints))
    gaps.push(gapText.equipment(limit));
  return unique(gaps);
}

function risksOf(args: EvidenceCardInput, crops: readonly CropEntry[]): string[] {
  const { input, world, result } = args;
  const risks: string[] = [];
  for (const { pest, crop, breakSeasons } of pestBreakViolations(world.pack.pests, crops)) {
    risks.push(riskText.pest(crop.name, pest.name, breakSeasons));
  }
  const total = result.seasons.length;
  if (result.resilience.frost_heat_hits / total >= FROST_RISK_FROM) {
    risks.push(riskText.frost(result.resilience.frost_heat_hits, total));
  }
  if (soilParams(input.soil).hydrologicGroup === "D") {
    const wet = crops.find(
      (c) => c.kind === "crop" && (c.family === "fabaceae" || c.family === "brassicaceae"),
    );
    if (wet) risks.push(riskText.waterlogging(wet.name));
  }
  for (const crop of new Set(crops)) {
    if (isCrop(crop) && crop.kind === "crop" && !crop.market_flag.value)
      risks.push(riskText.market(crop.name));
  }
  for (const note of args.arenaDisagreements ?? []) risks.push(riskText.arena(note));
  return unique(risks);
}

/** Builds one evidence card (F-08) from a rotation's replay result. */
export function buildEvidenceCard(
  args: EvidenceCardInput & { agreementKnown?: boolean },
): EvidenceCard {
  const { bundle, input, world, rotation, result, baseline, confidence } = args;
  const crops = planOf(world.pack, rotation).seasons.map((s) => s.entry);
  const isBaseline = input.baseline?.id === rotation.id;
  const p = provenanceOf(bundle, world, result.seasons);
  const compareTo = isBaseline ? null : baseline;
  const total = result.seasons.length;
  const hadSevere = result.resilience.severe_water_stress_seasons;
  const card: EvidenceCard = {
    schema: "evidence-card/1.0",
    rotation_id: rotation.id,
    is_baseline: isBaseline,
    why: whyOf(result, compareTo, isBaseline),
    evidence: evidenceItems(p, result, compareTo, isBaseline, input) as EvidenceCard["evidence"],
    benefits: benefitsOf(
      result,
      compareTo,
      crops,
      input.constraints.livestock,
    ) as EvidenceCard["benefits"],
    gaps: gapsOf(args, crops, args.agreementKnown ?? confidence.factors.agreement !== null),
    risks: risksOf(args, crops),
    score: result.score,
    resilience_headline: headlineText.water(
      hadSevere,
      total,
      compareTo ? compareTo.resilience.severe_water_stress_seasons : null,
      compareTo ? compareTo.seasons.length : null,
    ),
    confidence: { level: confidence.level, reasons: confidence.reasons as [string, ...string[]] },
    contributions: result.contributions,
  };
  return {
    ...card,
    why: clip(card.why),
    evidence: card.evidence.map((e) => ({
      ...e,
      indicator: clip(e.indicator),
      comparison: clip(e.comparison),
      source: clip(e.source),
      resolution: clip(e.resolution),
      period: clip(e.period),
    })) as EvidenceCard["evidence"],
    benefits: card.benefits.map(clip) as EvidenceCard["benefits"],
    gaps: card.gaps.map(clip),
    risks: card.risks.map(clip),
    resilience_headline: clip(card.resilience_headline),
    confidence: {
      level: card.confidence.level,
      reasons: card.confidence.reasons.map(clip) as [string, ...string[]],
    },
  };
}

export interface EvidenceRequest {
  bundle: FieldBundle;
  input: EngineInput;
  /** Replay output (see `scoreReplay`) for the rotations to explain. */
  output: EngineOutput;
  /** Definitions of the rotations in `output`; defaults to the input's rotations and baseline. */
  rotations?: readonly Rotation[];
  packId?: string;
  groundTruth?: GroundTruth;
  arenaDisagreements?: readonly string[];
}

/**
 * Evidence cards for every rotation in a replay output, in its order (best first). Model-satellite
 * agreement is computed once, for the farmer's current rotation, and shared by all cards.
 */
export function buildEvidenceCards(request: EvidenceRequest): EvidenceCard[] {
  const { bundle, input, output } = request;
  const world = createReplayWorld({
    bundle,
    input,
    ...(request.packId ? { packId: request.packId } : {}),
  });
  const known = new Map<string, Rotation>();
  for (const r of request.rotations ?? [
    ...input.rotations,
    ...(input.baseline ? [input.baseline] : []),
  ])
    known.set(r.id, r);
  const baselineResult = input.baseline
    ? (output.results.find((r) => r.rotation_id === input.baseline?.id) ?? null)
    : null;
  const agreement = input.baseline
    ? modelSatelliteAgreement(world, planOf(world.pack, input.baseline, "baseline"), bundle)
    : null;
  return output.results.map((result) => {
    const rotation = known.get(result.rotation_id);
    if (!rotation) throw new RangeError(`No definition for rotation ${result.rotation_id}`);
    const crops = planOf(world.pack, rotation).seasons.map((s) => s.entry);
    const confidence = confidenceFor({
      bundle,
      input,
      world,
      crops,
      agreement,
      ...(request.groundTruth ? { groundTruth: request.groundTruth } : {}),
    });
    return buildEvidenceCard({
      bundle,
      input,
      world,
      rotation,
      result,
      baseline: baselineResult,
      confidence,
      agreementKnown: agreement !== null,
      ...(request.arenaDisagreements ? { arenaDisagreements: request.arenaDisagreements } : {}),
    });
  });
}
