import type { CropEntry, PestEntry } from "@itza/knowledge";
import type { DailyForcing } from "../physics";
import type { AgriculturalYear } from "./calendar";
import { clamp01 } from "./stats";

const WET_DAY_MM = 1;
const WARM_DAY_C = 25;
const RISK_MIN = 0.5;
const RISK_MAX = 1.5;

/** Weather risk r in [0.5, 1.5] of one season for each pest weather driver. */
export interface WeatherRisk {
  wet: number;
  warm_dry: number;
  none: number;
}

/**
 * Weather risk per year: wet days (fungal pests) and warm dry days (insects) against the median year
 * of the record, so an average year gives 1, twice the median or more gives 1.5, none gives 0.5.
 */
export function weatherRisks(
  forcing: DailyForcing,
  years: readonly AgriculturalYear[],
): WeatherRisk[] {
  const counts = years.map((year) => {
    let wet = 0;
    let warmDry = 0;
    for (let day = year.startDay; day < year.endDay; day++) {
      const i = day - forcing.startDay;
      if (i < 0 || i >= forcing.days) continue;
      const p = forcing.precip[i] as number;
      if (p >= WET_DAY_MM) wet++;
      else if ((forcing.tmax[i] as number) >= WARM_DAY_C) warmDry++;
    }
    return { wet, warmDry };
  });
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  };
  const wetMedian = median(counts.map((c) => c.wet));
  const dryMedian = median(counts.map((c) => c.warmDry));
  const risk = (count: number, mid: number) =>
    mid > 0 ? Math.min(RISK_MAX, Math.max(RISK_MIN, RISK_MIN + count / (2 * mid))) : 1;
  return counts.map((c) => ({
    wet: risk(c.wet, wetMedian),
    warm_dry: risk(c.warmDry, dryMedian),
    none: 1,
  }));
}

function hosts(pest: PestEntry, crop: CropEntry): boolean {
  if (pest.hosts.crops.includes(crop.id)) return true;
  return crop.kind !== "fallow" && pest.hosts.families.includes(crop.family);
}

/**
 * Pest pressure 0 to 1 on the crop at `position` of a rotation that repeats. For each pest the
 * crop hosts, every earlier host season within the pest's window W (the longer of soil persistence
 * and minimum break, in seasons) adds inoculum (W - gap + 1) / W; the pest's pressure is that
 * inoculum, capped at 1, times the weather risk. Pests combine as independent chances.
 */
export function pestPressure(
  pests: readonly PestEntry[],
  sequence: readonly CropEntry[],
  position: number,
  risk: WeatherRisk,
): number {
  const here = sequence[position] as CropEntry;
  const n = sequence.length;
  let free = 1;
  for (const pest of pests) {
    if (!hosts(pest, here)) continue;
    const window = Math.max(
      Math.ceil(pest.soil_persistence_years.value),
      Math.ceil(pest.min_break_years.value),
    );
    let inoculum = 0;
    for (let gap = 1; gap <= window; gap++) {
      const earlier = sequence[(((position - gap) % n) + n) % n] as CropEntry;
      if (hosts(pest, earlier)) inoculum += (window - gap + 1) / window;
    }
    free *= 1 - clamp01(Math.min(1, inoculum) * risk[pest.weather_driver]);
  }
  return 1 - free;
}
