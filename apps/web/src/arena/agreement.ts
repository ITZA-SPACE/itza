import { t } from "../copy";
import { fmt } from "../lib/format";

/** 0 = a normal season, 1 = some stress, 2 = strong stress. */
export type Level = 0 | 1 | 2;
export type Opinion = "rule" | "ml" | "sat";

/** Rule engine: stress is 1 minus the water-balance score of the season (0 to 1). */
export const ruleLevel = (stress: number): Level => (stress >= 0.6 ? 2 : stress >= 0.35 ? 1 : 0);
/** ML prediction and observed NDVI peak are both z-scores: negative is a poorer season than usual. */
export const zLevel = (z: number): Level => (z <= -1 ? 2 : z <= -0.4 ? 1 : 0);

export type Levels = Partial<Record<Opinion, Level>>;

export interface SeasonAgreement {
  /** 1 when all available opinions give the same level, 0 when they are as far apart as possible; null with fewer than two. */
  score: number | null;
  flags: Flag[];
}

/** One opinion sees strong stress where another sees a normal season. */
export interface Flag {
  season: string;
  stressed: Opinion;
  calm: Opinion;
}

const ORDER: Opinion[] = ["rule", "ml", "sat"];

export function agreement(season: string, levels: Levels): SeasonAgreement {
  const present = ORDER.filter((o) => levels[o] !== undefined);
  const flags: Flag[] = [];
  let gap = 0;
  let pairs = 0;
  for (const [i, a] of present.entries()) {
    for (const b of present.slice(i + 1)) {
      const la = levels[a] as Level;
      const lb = levels[b] as Level;
      gap += Math.abs(la - lb);
      pairs++;
      if (la === 2 && lb === 0) flags.push({ season, stressed: a, calm: b });
      if (lb === 2 && la === 0) flags.push({ season, stressed: b, calm: a });
    }
  }
  return { score: pairs ? 1 - gap / (2 * pairs) : null, flags };
}

const FLAG_KEYS = {
  "rule>ml": "arena.flag.ruleMl",
  "ml>rule": "arena.flag.mlRule",
  "rule>sat": "arena.flag.ruleSat",
  "sat>rule": "arena.flag.satRule",
  "ml>sat": "arena.flag.mlSat",
  "sat>ml": "arena.flag.satMl",
} as const;

/** The plain-English note of a flag, also passed to the evidence cards as a risk. */
export function flagText(flag: Flag): string {
  return fmt(t(FLAG_KEYS[`${flag.stressed}>${flag.calm}` as keyof typeof FLAG_KEYS]), {
    season: flag.season,
  });
}

/** At most this many notes reach the evidence cards, the most recent seasons first. */
export const MAX_CARD_FLAGS = 3;
