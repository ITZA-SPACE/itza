import type { Priorities, RotationResult } from "@itza/engine/contracts";
import type { CompareResult, ReplayClient, Weighted } from "@itza/engine/worker";
import { DATA_PATHS } from "@itza/ui-kit/catalog";
import { type CopyKey, t } from "../copy";
import { glossaryTermIds } from "../glossary";
import { fmt } from "../lib/format";
import {
  type ClimateView,
  type CompareView,
  type EvidenceView,
  type FutureView,
  type ProposalView,
  type SourceView,
  sourcesOfCards,
  type TimelineView,
} from "./views";

export const CLIENT_TOOLS = [
  "get_field_summary",
  "compare_rotations",
  "run_backtest",
  "get_season",
  "explain_exclusion",
  "set_priorities",
  "set_constraints",
  "navigate",
  "define_term",
] as const;

export type ClientToolName = (typeof CLIENT_TOOLS)[number];

export const isClientTool = (name: string): name is ClientToolName =>
  (CLIENT_TOOLS as readonly string[]).includes(name);

export const NAV_VIEWS = ["map", "replay", "cards", "twin", "future", "zones"] as const;
export type NavView = (typeof NAV_VIEWS)[number];

export const PRIORITY_KEYS = [
  "water",
  "soil_health",
  "nitrogen",
  "erosion",
  "forage",
  "income",
  "pest_break",
] as const satisfies readonly (keyof Priorities)[];

export interface ReadyCompare {
  view: CompareResult & Weighted;
}

export interface ToolDeps {
  /** Resolves once the field's comparison is in the worker; rejects when there is no field. */
  ready(): Promise<ReadyCompare>;
  engine(): ReplayClient;
  /** The `/v1/projection` payload for the field (2050 factors). */
  projection(): Promise<unknown>;
  field(): { areaHa: number; centroid: [number, number] } | null;
  navigate(view: NavView): void;
  /** Crops of the field's region pack, for constraint proposals. */
  crops(packId: string): { id: string; name: string }[];
}

export interface ToolOutcome {
  /** Compact, grounded result sent back to the model. */
  output: Record<string, unknown>;
  /** Values for the answer components, by data path. They never go to the model. */
  view: Record<string, unknown>;
  sources: SourceView[];
  /** Fills `assistant.trace.summary.*`. */
  summaryParams: Record<string, string | number>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export class ToolInputError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function stringArg(input: unknown, key: string): string {
  const value = isObject(input) ? input[key] : undefined;
  if (typeof value !== "string" || value.trim() === "")
    throw new ToolInputError(`${key} is needed`);
  return value.trim();
}

function namesOf(view: CompareResult & Weighted): Record<string, string> {
  return Object.fromEntries(view.rotations.map((r) => [r.id, r.name]));
}

function resultOf(view: CompareResult & Weighted, id: string): RotationResult | undefined {
  return view.output.results.find((r) => r.rotation_id === id);
}

function compareViewOf(view: CompareResult & Weighted, wanted?: readonly string[]): CompareView {
  const cards = wanted?.length
    ? view.cards.filter((c) => wanted.includes(c.rotation_id) || c.is_baseline)
    : view.cards;
  return { label: view.label, baselineId: view.baselineId, names: namesOf(view), cards };
}

/** Matches a rotation by id, then by name, then by a crop named in it. */
export function findRotation(view: CompareResult & Weighted, query: string): string | null {
  const q = query.trim().toLowerCase();
  const byId = view.rotations.find((r) => r.id.toLowerCase() === q);
  if (byId) return byId.id;
  const byName = view.rotations.find((r) => r.name.toLowerCase() === q);
  if (byName) return byName.id;
  const contains = view.rotations.filter((r) => r.name.toLowerCase().includes(q));
  const preferred = contains.find((r) => r.id !== view.baselineId) ?? contains[0];
  return preferred?.id ?? null;
}

function hardestSeason(result: RotationResult): string {
  let worst = result.seasons[0];
  for (const s of result.seasons) if (worst && s.composite < worst.composite) worst = s;
  return worst?.season ?? "";
}

async function timelineView(
  deps: ToolDeps,
  view: CompareResult & Weighted,
  season: string,
  focusId?: string,
): Promise<TimelineView> {
  const timeline = await deps.engine().timeline(season);
  return {
    names: namesOf(view),
    baselineId: view.baselineId,
    worstSeason: view.worstSeason,
    timeline,
    ...(focusId ? { focusId } : {}),
  };
}

function climateViewOf(view: CompareResult & Weighted): ClimateView {
  return {
    worstSeason: view.worstSeason,
    items: view.seasons.map((s) => ({
      id: s.label,
      label: s.label,
      value: s.meanScore,
      caption: fmt(t("compare.season.caption"), { season: s.label, score: s.meanScore.toFixed(2) }),
    })),
  };
}

async function fieldSummary(deps: ToolDeps): Promise<ToolOutcome> {
  const { view } = await deps.ready();
  const field = deps.field();
  const baseline = view.baselineId ? namesOf(view)[view.baselineId] : undefined;
  return {
    output: {
      area_ha: field ? r2(field.areaHa) : null,
      latitude: field ? r4(field.centroid[1]) : null,
      longitude: field ? r4(field.centroid[0]) : null,
      seasons_replayed: view.seasons.length,
      hardest_season: view.worstSeason,
      current_rotation: baseline ?? null,
      rotations_compared: view.rotations.length,
      season_scores: view.seasons.map((s) => ({ season: s.label, mean_score: r2(s.meanScore) })),
      gaps: view.gaps.slice(0, 4),
    },
    view: { [DATA_PATHS.climate]: climateViewOf(view) },
    sources: sourcesOfCards(view.cards),
    summaryParams: {},
  };
}

async function compareRotations(deps: ToolDeps, input: unknown): Promise<ToolOutcome> {
  const { view } = await deps.ready();
  const ids = isObject(input) && Array.isArray(input.ids) ? input.ids.map(String) : [];
  const wanted = ids.map((id) => findRotation(view, id)).filter((id): id is string => id !== null);
  const compare = compareViewOf(view, wanted);
  const names = namesOf(view);
  const shown = compare.cards.map((card) => {
    const result = resultOf(view, card.rotation_id);
    return {
      id: card.rotation_id,
      name: names[card.rotation_id] ?? card.rotation_id,
      is_baseline: card.is_baseline,
      score: r2(card.score),
      headline: card.resilience_headline,
      confidence: card.confidence.level,
      p10: result ? r2(result.resilience.p10) : null,
      worst: result ? r2(result.resilience.worst) : null,
      severe_water_stress_seasons: result?.resilience.severe_water_stress_seasons ?? null,
    };
  });
  const lead = compare.cards.find((c) => !c.is_baseline) ?? compare.cards[0];
  const evidence: EvidenceView | null = lead
    ? { name: names[lead.rotation_id] ?? lead.rotation_id, card: lead }
    : null;
  return {
    output: { label: view.label, baseline_id: view.baselineId, rotations: shown },
    view: {
      [DATA_PATHS.rotations]: compare,
      ...(evidence ? { [DATA_PATHS.evidence]: evidence } : {}),
    },
    sources: sourcesOfCards(compare.cards),
    summaryParams: {},
  };
}

async function runBacktest(deps: ToolDeps, input: unknown): Promise<ToolOutcome> {
  const query = stringArg(input, "rotation");
  const scenario = isObject(input) && input.scenario === "2050" ? "2050" : "history";
  const { view } = await deps.ready();
  const id = findRotation(view, query);
  const result = id ? resultOf(view, id) : undefined;
  if (!id || !result) {
    const why = await deps.engine().whyNot(query);
    return {
      output: { found: false, requested: query, excluded: why.excluded, reason: why.reason },
      view: {},
      sources: [],
      summaryParams: { rotation: query },
    };
  }
  const name = namesOf(view)[id] ?? id;
  const worst = hardestSeason(result);
  const timeline = await timelineView(deps, view, worst, id);
  const compare = compareViewOf(view, [id]);
  const out: Record<string, unknown> = {
    found: true,
    rotation_id: id,
    name,
    scenario: "history",
    score: r2(result.score),
    median: r2(result.resilience.median),
    p10: r2(result.resilience.p10),
    p90: r2(result.resilience.p90),
    worst: r2(result.resilience.worst),
    severe_water_stress_seasons: result.resilience.severe_water_stress_seasons,
    frost_heat_hits: result.resilience.frost_heat_hits,
    win_rate: result.resilience.win_rate === null ? null : r2(result.resilience.win_rate),
    hardest_season: worst,
    seasons: result.seasons.map((s) => ({ season: s.season, score: r2(s.composite) })),
  };
  const views: Record<string, unknown> = {
    [DATA_PATHS.backtest]: timeline,
    [DATA_PATHS.rotations]: compare,
  };
  if (scenario === "2050") {
    const future = await deps.engine().future({
      payload: await deps.projection(),
      progress: 1,
      ssps: ["ssp245"],
    });
    const shift = future.ssps[0]?.rotations.find((r) => r.rotation_id === id);
    if (shift && future.ssps[0]) {
      out.scenario = "2050";
      out.ssp = future.ssps[0].ssp;
      out.score_change = r2(shift.score.median);
      out.score_change_min = r2(shift.score.min);
      out.score_change_max = r2(shift.score.max);
      out.severe_water_stress_change = shift.severe_water_stress_seasons;
      const futureView: FutureView = {
        rotationId: id,
        name,
        history: {
          score: shift.history.score,
          p10: shift.history.p10,
          worst: shift.history.worst,
          severe: shift.history.severe_water_stress_seasons,
        },
        ssps: future.ssps.map((s) => {
          const r = s.rotations.find((x) => x.rotation_id === id);
          return {
            ssp: s.ssp,
            scoreChange: r?.score ?? { median: 0, min: 0, max: 0 },
            severeChange: r?.severe_water_stress_seasons ?? 0,
          };
        }),
        models: future.provenance.models.length,
      };
      views[DATA_PATHS.future] = futureView;
    }
  }
  return {
    output: out,
    view: views,
    sources: sourcesOfCards(compare.cards),
    summaryParams: { rotation: name },
  };
}

function seasonLabel(view: CompareResult & Weighted, year: number): string | null {
  const short = String(year % 100).padStart(2, "0");
  const found =
    view.seasons.find((s) => s.label.startsWith(String(year))) ??
    view.seasons.find((s) => s.label.endsWith(`-${short}`));
  return found?.label ?? null;
}

async function getSeason(deps: ToolDeps, input: unknown): Promise<ToolOutcome> {
  const year = isObject(input) ? Number(input.year) : Number.NaN;
  if (!Number.isInteger(year)) throw new ToolInputError("year is needed");
  const { view } = await deps.ready();
  const label = seasonLabel(view, year);
  if (!label) {
    return {
      output: { found: false, year, seasons: view.seasons.map((s) => s.label) },
      view: {},
      sources: [],
      summaryParams: { season: String(year) },
    };
  }
  const timeline = await timelineView(deps, view, label);
  const names = namesOf(view);
  const rain = timeline.timeline.rain.reduce((a, b) => a + b, 0);
  const peak = timeline.timeline.ndvi.reduce((m, p) => Math.max(m, p.value), 0);
  return {
    output: {
      found: true,
      season: label,
      is_hardest: label === view.worstSeason,
      rain_mm: Math.round(rain),
      peak_ndvi: r2(peak),
      scores: timeline.timeline.scores.map((s) => ({
        rotation: names[s.rotation_id] ?? s.rotation_id,
        score: r2(s.composite),
        likely_low: s.band ? r2(s.band.p10) : null,
        likely_high: s.band ? r2(s.band.p90) : null,
      })),
    },
    view: { [DATA_PATHS.season]: timeline },
    sources: sourcesOfCards(view.cards),
    summaryParams: { season: label },
  };
}

async function explainExclusion(deps: ToolDeps, input: unknown): Promise<ToolOutcome> {
  const crop = stringArg(input, "crop");
  await deps.ready();
  const why = await deps.engine().whyNot(crop);
  return {
    output: { crop: why.crop, excluded: why.excluded, reason: why.reason },
    view: {},
    sources: [],
    summaryParams: { crop: why.crop },
  };
}

function defineTerm(input: unknown): ToolOutcome {
  const term = stringArg(input, "term");
  const q = term.toLowerCase();
  const id = glossaryTermIds.find((candidate) => {
    const label = t(`glossary.${candidate}.label` as CopyKey).toLowerCase();
    const title = t(`glossary.${candidate}.title` as CopyKey).toLowerCase();
    return candidate.toLowerCase() === q || label === q || title === q || title.includes(q);
  });
  const sources: SourceView[] = [];
  if (!id) {
    return {
      output: { found: false, term },
      view: {},
      sources,
      summaryParams: { term },
    };
  }
  return {
    output: {
      found: true,
      term: t(`glossary.${id}.title` as CopyKey),
      definition: t(`glossary.${id}.definition` as CopyKey),
    },
    view: {},
    sources: [
      {
        source: t("assistant.provenance.glossary"),
        resolution: t("assistant.provenance.na"),
        period: t("assistant.provenance.na"),
      },
    ],
    summaryParams: { term: t(`glossary.${id}.label` as CopyKey) },
  };
}

function navigateTo(deps: ToolDeps, input: unknown): ToolOutcome {
  const view = isObject(input) ? input.view : undefined;
  if (!NAV_VIEWS.includes(view as NavView)) throw new ToolInputError("view is not available");
  deps.navigate(view as NavView);
  return {
    output: { opened: view },
    view: {},
    sources: [],
    summaryParams: { view: t(`assistant.view.${view as NavView}` as CopyKey) },
  };
}

function proposePriorities(input: unknown): ToolOutcome {
  const given = isObject(input) && isObject(input.priorities) ? input.priorities : {};
  const values: Record<string, number> = {};
  for (const key of PRIORITY_KEYS) {
    const raw = given[key];
    // The assistant proposes 0 to 1; the sliders and the engine use 0 to 5.
    if (typeof raw === "number" && Number.isFinite(raw))
      values[key] = Math.min(5, Math.max(0, Math.round(raw * 5)));
  }
  const proposal: ProposalView = { kind: "priorities", values };
  return {
    output: { status: "pending_confirmation" },
    view: { [DATA_PATHS.proposal]: proposal },
    sources: [],
    summaryParams: {},
  };
}

const IRRIGATION_LEVELS = ["none", "supplemental", "full"] as const;
const YES = new Set(["yes", "true", "1", "y"]);

function proposeConstraints(deps: ToolDeps, packId: string, input: unknown): ToolOutcome {
  const given = isObject(input) && isObject(input.constraints) ? input.constraints : {};
  const values: Record<string, string> = {};
  const irrigation = String(given.irrigation ?? "").toLowerCase();
  if ((IRRIGATION_LEVELS as readonly string[]).includes(irrigation)) values.irrigation = irrigation;
  if (given.livestock !== undefined)
    values.livestock = YES.has(String(given.livestock).toLowerCase()) ? "yes" : "no";
  if (typeof given.excluded_crops === "string") {
    const known = new Set(deps.crops(packId).map((c) => c.id));
    const kept = given.excluded_crops
      .split(",")
      .map((c) => c.trim())
      .filter((c) => known.has(c));
    values.excluded_crops = kept.join(",");
  }
  const proposal: ProposalView = {
    kind: "constraints",
    values,
    crops: deps.crops(packId),
  };
  return {
    output: { status: "pending_confirmation" },
    view: { [DATA_PATHS.proposal]: proposal },
    sources: [],
    summaryParams: {},
  };
}

/** Runs one browser tool. Throws `ToolInputError` or an engine error; callers report it to the model. */
export async function runTool(
  name: ClientToolName,
  input: unknown,
  deps: ToolDeps,
): Promise<ToolOutcome> {
  switch (name) {
    case "get_field_summary":
      return fieldSummary(deps);
    case "compare_rotations":
      return compareRotations(deps, input);
    case "run_backtest":
      return runBacktest(deps, input);
    case "get_season":
      return getSeason(deps, input);
    case "explain_exclusion":
      return explainExclusion(deps, input);
    case "define_term":
      return defineTerm(input);
    case "navigate":
      return navigateTo(deps, input);
    case "set_priorities":
      return proposePriorities(input);
    case "set_constraints": {
      const { view } = await deps.ready();
      return proposeConstraints(deps, view.packId, input);
    }
  }
}
