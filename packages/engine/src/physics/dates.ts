/** UTC calendar helpers. A day number counts days since 1970-01-01, so there is no clock or locale. */
const MS_PER_DAY = 86_400_000;

export interface CalendarDay {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  /** Day of year, 1 to 366. */
  doy: number;
}

/** `YYYY-MM-DD` to a day number. */
export function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(dayNumber: number): CalendarDay {
  const date = new Date(dayNumber * MS_PER_DAY);
  const year = date.getUTCFullYear();
  return {
    year,
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    doy: dayNumber - Date.UTC(year, 0, 1) / MS_PER_DAY + 1,
  };
}

export function toIsoDate(dayNumber: number): string {
  const { year, month, day } = fromDayNumber(dayNumber);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Day number of `MM-DD` in the given year (29 February falls back to 28 in other years). */
export function dayNumberOfMonthDay(year: number, monthDay: string): number {
  const [m, d] = monthDay.split("-").map(Number) as [number, number];
  const day = Date.UTC(year, m - 1, d) / MS_PER_DAY;
  return fromDayNumber(day).month === m ? day : Date.UTC(year, m - 1, d - 1) / MS_PER_DAY;
}
