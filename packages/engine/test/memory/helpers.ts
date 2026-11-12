import type { NdviSource, SeasonLabel } from "../../src/memory";
import { mulberry32 } from "../../src/replay";

const DAY_MS = 86_400_000;
const BARE = 0.12;
const gauss = (t: number, centre: number, width: number): number =>
  Math.exp(-(((t - centre) / width) ** 2));

/** True NDVI at `t` days after 1 September for a season of the given kind (invented shapes, tests only). */
export function seasonCurve(kind: SeasonLabel, t: number): number {
  switch (kind) {
    case "winter_crop":
      return BARE + 0.58 * gauss(t, 215, 55);
    case "summer_crop":
      return BARE + 0.55 * gauss(t, 320, 40);
    case "double_crop":
      return BARE + 0.5 * gauss(t, 200, 30) + 0.5 * gauss(t, 330, 25);
    case "fallow_or_bare":
      return BARE + 0.13 * gauss(t, 200, 60);
    default:
      return BARE;
  }
}

export interface SyntheticOptions {
  /** One kind per agricultural year (September start). */
  kinds: SeasonLabel[];
  startYear?: number;
  seed?: number;
  /** Share of observations lost to cloud (quality 2). */
  cloud?: number;
  /** MODIS = slope * truth + offset, to be recovered by the bias fit. */
  modisBias?: { slope: number; offset: number };
  /** HLS covers the last `hlsYears` years at weekly cadence. */
  hlsYears?: number;
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** MODIS 16-day over the whole record plus optional weekly HLS over its last years. */
export function syntheticSources(o: SyntheticOptions): NdviSource[] {
  const startYear = o.startYear ?? 2000;
  const next = mulberry32(o.seed ?? 11);
  const t0 = Date.UTC(startYear, 8, 1);
  const total = Math.round((Date.UTC(startYear + o.kinds.length, 8, 1) - t0) / DAY_MS);
  const truth = (day: number): number => {
    const y = Math.min(o.kinds.length - 1, Math.floor(day / 365.25));
    const yStart = Math.round((Date.UTC(startYear + y, 8, 1) - t0) / DAY_MS);
    return seasonCurve(o.kinds[y] as SeasonLabel, day - yStart);
  };
  const make = (
    sensor: "hls" | "modis",
    first: number,
    step: number,
    cadence: "weekly" | "16day",
    bias: { slope: number; offset: number },
  ): NdviSource => {
    const values: (number | null)[] = [];
    const quality: number[] = [];
    for (let d = first; d < total; d += step) {
      const lost = next() < (o.cloud ?? 0);
      values.push(lost ? null : bias.slope * truth(d) + bias.offset + (next() - 0.5) * 0.04);
      quality.push(lost ? 2 : 0);
    }
    return { sensor, cadence, start: iso(t0 + first * DAY_MS), values, quality };
  };
  const out = [make("modis", 0, 16, "16day", o.modisBias ?? { slope: 1, offset: 0 })];
  if (o.hlsYears) {
    const first = Math.round(
      (Date.UTC(startYear + o.kinds.length - o.hlsYears, 8, 1) - t0) / DAY_MS,
    );
    out.push(make("hls", first, 7, "weekly", { slope: 1, offset: 0 }));
  }
  return out;
}

/** 25 seasons: winter crop on even years and fallow on odd ones, with a few summer and double crops. */
export const KINDS_25: SeasonLabel[] = Array.from(
  { length: 25 },
  (_, i) =>
    (
      ({ 5: "summer_crop", 8: "double_crop", 14: "summer_crop", 18: "double_crop" }) as Record<
        number,
        SeasonLabel
      >
    )[i] ?? (i % 2 === 0 ? "winter_crop" : "fallow_or_bare"),
);
