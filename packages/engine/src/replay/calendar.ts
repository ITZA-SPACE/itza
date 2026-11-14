import {
  type Crop,
  type DailyForcing,
  defaultSowingDay,
  fromDayNumber,
  toDayNumber,
} from "../physics";
import type { MonthSpan } from "./soilHealth";

export interface AgriculturalYear {
  /** Label such as `2021-22`. */
  label: string;
  /** Calendar year in which the agricultural year starts. */
  year: number;
  startDay: number;
  /** Day number after the last day of the year. */
  endDay: number;
  /** Share of the year's days with observed temperature and rain reaches `minCoverage`. */
  usable: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Agricultural years that overlap the forcing; the same usability rule as the Climate Fingerprint. */
export function agriculturalYears(
  forcing: DailyForcing,
  startMonth: number,
  minCoverage = 0.9,
): AgriculturalYear[] {
  const first = fromDayNumber(forcing.startDay);
  const last = fromDayNumber(forcing.startDay + forcing.days - 1);
  const startYear = first.month >= startMonth ? first.year : first.year - 1;
  const endYear = last.month >= startMonth ? last.year : last.year - 1;
  const years: AgriculturalYear[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const startDay = toDayNumber(`${year}-${pad(startMonth)}-01`);
    const endDay = toDayNumber(`${year + 1}-${pad(startMonth)}-01`);
    let observed = 0;
    for (
      let day = Math.max(startDay, forcing.startDay);
      day < Math.min(endDay, forcing.startDay + forcing.days);
      day++
    ) {
      observed += forcing.observed[day - forcing.startDay] as number;
    }
    years.push({
      label: startMonth === 1 ? `${year}` : `${year}-${pad((year + 1) % 100)}`,
      year,
      startDay,
      endDay,
      usable: observed / (endDay - startDay) >= minCoverage,
    });
  }
  return years;
}

/** Sowing day of a crop in an agricultural year: the doy override, else the middle of its window. */
export function sowingDayIn(crop: Crop, year: AgriculturalYear, overrideDoy?: number): number {
  if (overrideDoy !== undefined) {
    const inStartYear = toDayNumber(`${year.year}-01-01`) + overrideDoy - 1;
    return inStartYear >= year.startDay
      ? inStartYear
      : toDayNumber(`${year.year + 1}-01-01`) + overrideDoy - 1;
  }
  const inStartYear = defaultSowingDay(crop, year.year);
  return inStartYear >= year.startDay ? inStartYear : defaultSowingDay(crop, year.year + 1);
}

/** The twelve months of an agricultural year as day-number spans `[start, end)`. */
export function monthSpans(year: AgriculturalYear, startMonth: number): MonthSpan[] {
  const starts: number[] = [];
  for (let m = 0; m <= 12; m++) {
    const index = startMonth - 1 + m;
    const y = year.year + Math.floor(index / 12);
    starts.push(toDayNumber(`${y}-${pad((index % 12) + 1)}-01`));
  }
  return starts.slice(0, 12).map((start, m) => ({ start, end: starts[m + 1] as number }));
}
