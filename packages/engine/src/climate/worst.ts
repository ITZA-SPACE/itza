import type { SeasonIndicators } from "./indicators";

export type Hazard = "lowest_rain" | "highest_heat" | "driest_soil" | "worst_frost";

export interface WorstSeason {
  hazard: Hazard;
  season: string;
  /** The ranked value: rain in mm, heat or frost score in days, or soil-moisture z-score. */
  value: number;
  /** Mean of that value over the usable seasons, and how far this season is from it. */
  mean: number;
  deviation: number;
  /** z-score of the value among usable seasons; null with fewer than 3 seasons. */
  z: number | null;
}

export type WorstSeasons = Record<Hazard, WorstSeason[]>;

const TOP = 3;

interface Ranking {
  hazard: Hazard;
  value: (s: SeasonIndicators) => number | null;
  /** 1 when higher is worse, -1 when lower is worse. */
  worse: 1 | -1;
  /** A season only counts as having this hazard when it returns true (no frost, no frost ranking). */
  present?: (s: SeasonIndicators) => boolean;
}

const RANKINGS: Ranking[] = [
  { hazard: "lowest_rain", value: (s) => s.rainMm, worse: -1 },
  // Heat score counts days above 30 C once and days above 35 C twice.
  {
    hazard: "highest_heat",
    value: (s) => s.heatDays30 + s.heatDays35,
    worse: 1,
    present: (s) => s.heatDays30 > 0,
  },
  { hazard: "driest_soil", value: (s) => s.soilMoistureZ, worse: -1 },
  {
    // Frost score counts days below 0 C once and days below -2 C twice.
    hazard: "worst_frost",
    value: (s) => s.frostDays0 + s.frostDays2,
    worse: 1,
    present: (s) => s.frostDays0 > 0,
  },
];

/** The three worst usable seasons for each hazard, with how far each is from the average season. */
export function detectWorstSeasons(seasons: readonly SeasonIndicators[]): WorstSeasons {
  const usable = seasons.filter((s) => s.usable);
  const out: WorstSeasons = { lowest_rain: [], highest_heat: [], driest_soil: [], worst_frost: [] };
  for (const ranking of RANKINGS) {
    const rows = usable.flatMap((s) => {
      const value = ranking.value(s);
      return value === null || (ranking.present && !ranking.present(s)) ? [] : [{ s, value }];
    });
    if (rows.length === 0) continue;
    const mean = rows.reduce((a, r) => a + r.value, 0) / rows.length;
    const sd =
      rows.length >= 3
        ? Math.sqrt(rows.reduce((a, r) => a + (r.value - mean) ** 2, 0) / (rows.length - 1))
        : null;
    rows.sort((x, y) => (y.value - x.value) * ranking.worse || x.s.label.localeCompare(y.s.label));
    out[ranking.hazard] = rows.slice(0, TOP).map(({ s, value }) => ({
      hazard: ranking.hazard,
      season: s.label,
      value,
      mean,
      deviation: value - mean,
      z: sd === null ? null : sd < 1e-12 ? 0 : (value - mean) / sd,
    }));
  }
  return out;
}
