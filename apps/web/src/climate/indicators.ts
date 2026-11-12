import type { Indicators } from "@itza/engine/climate";
import type { CopyKey } from "../copy";

export interface IndicatorDef {
  id: string;
  title: CopyKey;
  /** One sentence that says what the number means. */
  explain: CopyKey;
  /** Unit text appended to the value. */
  unit: CopyKey;
  digits: number;
  value: (x: Indicators) => number | null;
}

/** The indicator cards, in reading order. Each carries an explanation and, in the UI, its provenance. */
export const INDICATORS: readonly IndicatorDef[] = [
  {
    id: "rain",
    title: "climate.ind.rain.title",
    explain: "climate.ind.rain.explain",
    unit: "climate.unit.mm",
    digits: 0,
    value: (x) => x.rainMm,
  },
  {
    id: "heavyRain",
    title: "climate.ind.heavyRain.title",
    explain: "climate.ind.heavyRain.explain",
    unit: "climate.unit.mm",
    digits: 0,
    value: (x) => x.maxDailyRainMm,
  },
  {
    id: "drySpell",
    title: "climate.ind.drySpell.title",
    explain: "climate.ind.drySpell.explain",
    unit: "climate.unit.days",
    digits: 0,
    value: (x) => x.longestDrySpellDays,
  },
  {
    id: "frost",
    title: "climate.ind.frost.title",
    explain: "climate.ind.frost.explain",
    unit: "climate.unit.days",
    digits: 0,
    value: (x) => x.frostDays0,
  },
  {
    id: "hardFrost",
    title: "climate.ind.hardFrost.title",
    explain: "climate.ind.hardFrost.explain",
    unit: "climate.unit.days",
    digits: 0,
    value: (x) => x.frostDays2,
  },
  {
    id: "hot",
    title: "climate.ind.hot.title",
    explain: "climate.ind.hot.explain",
    unit: "climate.unit.days",
    digits: 0,
    value: (x) => x.heatDays30,
  },
  {
    id: "veryHot",
    title: "climate.ind.veryHot.title",
    explain: "climate.ind.veryHot.explain",
    unit: "climate.unit.days",
    digits: 0,
    value: (x) => x.heatDays35,
  },
  {
    id: "gdd",
    title: "climate.ind.gdd.title",
    explain: "climate.ind.gdd.explain",
    unit: "climate.unit.gdd",
    digits: 0,
    value: (x) => x.gdd,
  },
  {
    id: "et0",
    title: "climate.ind.et0.title",
    explain: "climate.ind.et0.explain",
    unit: "climate.unit.mm",
    digits: 0,
    value: (x) => x.et0Mm,
  },
  {
    id: "balance",
    title: "climate.ind.balance.title",
    explain: "climate.ind.balance.explain",
    unit: "climate.unit.mm",
    digits: 0,
    value: (x) => x.rainMinusEt0Mm,
  },
  {
    id: "soil",
    title: "climate.ind.soil.title",
    explain: "climate.ind.soil.explain",
    unit: "climate.unit.z",
    digits: 1,
    value: (x) => x.soilMoistureZ,
  },
];

const formats = new Map<number, Intl.NumberFormat>();

/** A number with a fixed number of decimals and a plain minus sign. */
export function formatNumber(value: number, digits: number): string {
  let format = formats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("en", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formats.set(digits, format);
  }
  return format.format(value);
}

/** Mean of a number over the seasons that have it, or null. */
export function typical(values: readonly (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}
