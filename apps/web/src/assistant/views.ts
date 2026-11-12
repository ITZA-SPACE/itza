import type { EvidenceCard } from "@itza/engine/contracts";
import type { TimelineResult } from "@itza/engine/worker";

/** What the answer components bind to: tool results in the shape the components draw. */

export interface SourceView {
  source: string;
  resolution: string;
  period: string;
}

export interface CallView {
  tool: string;
  summary: string;
}

export interface CompareView {
  label: string;
  baselineId: string | null;
  names: Record<string, string>;
  cards: EvidenceCard[];
}

export interface EvidenceView {
  name: string;
  card: EvidenceCard;
}

export interface TimelineView {
  names: Record<string, string>;
  baselineId: string | null;
  worstSeason: string | null;
  timeline: TimelineResult;
  /** Rotation to show next to the baseline; all rotations when absent. */
  focusId?: string;
  /** Plain description of the replay, such as "Replayed on a 2050 climate". */
  note?: string;
}

export interface ClimateView {
  items: { id: string; label: string; value: number; caption: string }[];
  worstSeason: string | null;
}

export interface FutureView {
  rotationId: string;
  name: string;
  history: { score: number; p10: number; worst: number; severe: number };
  ssps: {
    ssp: string;
    scoreChange: { median: number; min: number; max: number };
    severeChange: number;
  }[];
  models: number;
}

export type ProposalKind = "priorities" | "constraints";

export interface ProposalView {
  kind: ProposalKind;
  values: Record<string, string | number>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isCompareView = (v: unknown): v is CompareView =>
  isObject(v) && Array.isArray(v.cards) && isObject(v.names);
export const isEvidenceView = (v: unknown): v is EvidenceView =>
  isObject(v) && isObject(v.card) && typeof v.name === "string";
export const isTimelineView = (v: unknown): v is TimelineView =>
  isObject(v) && isObject(v.timeline) && Array.isArray((v.timeline as { lanes?: unknown }).lanes);
export const isClimateView = (v: unknown): v is ClimateView =>
  isObject(v) && Array.isArray(v.items);
export const isFutureView = (v: unknown): v is FutureView =>
  isObject(v) && isObject(v.history) && Array.isArray(v.ssps);
export const isProposalView = (v: unknown): v is ProposalView =>
  isObject(v) && (v.kind === "priorities" || v.kind === "constraints") && isObject(v.values);

/** Distinct sources of a set of cards, in order of first appearance. */
export function sourcesOfCards(cards: readonly EvidenceCard[]): SourceView[] {
  const seen = new Map<string, SourceView>();
  for (const card of cards) {
    for (const item of card.evidence) {
      const key = `${item.source}|${item.resolution}|${item.period}`;
      if (!seen.has(key))
        seen.set(key, { source: item.source, resolution: item.resolution, period: item.period });
    }
  }
  return [...seen.values()];
}
