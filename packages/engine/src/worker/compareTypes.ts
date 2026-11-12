import type {
  EngineInput,
  EngineOutput,
  EvidenceCard,
  FieldBundle,
  Priorities,
  Rotation,
} from "../contracts";
import type { Exclusion, GroundTruth } from "../decisions";

/** What the comparison needs from the app: the bundle and the farmer's input, without rotations. */
export interface CompareRequest {
  bundle: FieldBundle;
  /** The engine input; its rotations are replaced by the generated candidates. */
  input: Omit<EngineInput, "rotations">;
  packId?: string;
  /** Alternatives to compare with the current rotation. Default 4. */
  topN?: number;
  groundTruth?: GroundTruth;
}

export interface SeasonScore {
  label: string;
  /** Mean composite of the rotations replayed that season. */
  meanScore: number;
}

/** A crop the generator left out, with the filter or ranking that decided it. */
export interface LeftOutCrop {
  crop: string;
  name: string;
  filter: string;
  reason: string;
}

export interface RotationName {
  id: string;
  name: string;
}

/** Results that depend on the priority weights; recomputed without simulating when they move. */
export interface Weighted {
  output: EngineOutput;
  cards: EvidenceCard[];
  /** Seasons all rotations were replayed in, oldest first. */
  seasons: SeasonScore[];
  /** The season with the lowest mean composite: where the replay opens by default. */
  worstSeason: string | null;
}

export interface CompareResult extends Weighted {
  rotations: RotationName[];
  /** The rotations as replayed, the current one included, so another scenario can replay the same set. */
  definitions: Rotation[];
  baselineId: string | null;
  packId: string;
  leftOut: LeftOutCrop[];
  gaps: string[];
  /** The label every replay result carries: a counterfactual, not a measured yield. */
  label: string;
}

export interface ReweighRequest {
  priorities: Priorities;
}

/** One rotation's season, day by day, from the agricultural year's first day. */
export interface LaneTimeline {
  rotation_id: string;
  name: string;
  /** Crop id of the season, `fallow` when the field is bare. */
  crop: string;
  /** Share of the root zone's plant-available water that is left, 0 to 1. */
  soilWater: number[];
  /** How short of water the crop is, 0 (none) to 1; always 0 on bare days. */
  stress: number[];
  /** Ground cover, 0 to 1. */
  cover: number[];
  /** Which stage of the crop each day is in: -1 bare, 0 to 3 initial to late. */
  stage: number[];
}

export interface TimelineResult {
  season: string;
  /** ISO date of the first day. */
  startDate: string;
  days: number;
  /** Daily rain, mm, shared by all rotations. */
  rain: number[];
  /** Observed greenness inside the season window. */
  ndvi: { date: string; value: number }[];
  lanes: LaneTimeline[];
  /** Composite score with its Monte Carlo band for the season, per rotation. */
  scores: {
    rotation_id: string;
    composite: number;
    band: { p10: number; median: number; p90: number } | null;
  }[];
}

export type { Exclusion };
