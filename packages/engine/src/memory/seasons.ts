import type { PhenologySeason } from "../contracts";
import { fromDayNumber, toDayNumber, toIsoDate } from "../physics/dates";
import { cropId } from "./rotation";
import { GRID_STEP } from "./series";
import type {
  BareMatrix,
  Confidence,
  CrossCheck,
  MemoryOptions,
  ReferenceSeason,
  SeasonLabel,
  SeasonResult,
} from "./types";

const MS_PER_DAY = 86_400_000;
const LEVELS: Confidence[] = ["low", "medium", "high"];
/** Two crop peaks are separate crops when the trough between them is this far below both. */
const DOUBLE_PROMINENCE = 0.15;
/** ... and they are at least this many days apart. */
const DOUBLE_MIN_SEPARATION_DAYS = 60;
/** Share of the amplitude that marks green-up and senescence. */
const CROSSING = 0.2;

export interface SeasonSpan {
  id: string;
  start: number;
  end: number;
}

export interface GridView {
  g0: number;
  /** Smoothed NDVI per grid cell (null where missing). */
  values: (number | null)[];
  /** 0 observed, 1 interpolated, 2 missing. */
  flags: number[];
}

const dayOf = (g: GridView, i: number): number => g.g0 + i * GRID_STEP;

/** Agricultural years that the grid covers (a trailing partial year is tolerated up to 16 days). */
export function segmentSeasons(
  firstDay: number,
  lastDay: number,
  startMonth: number,
): SeasonSpan[] {
  const startOf = (y: number): number => Date.UTC(y, startMonth - 1, 1) / MS_PER_DAY;
  let y = fromDayNumber(firstDay).year - 1;
  while (startOf(y) < firstDay - 16) y++;
  const out: SeasonSpan[] = [];
  for (; startOf(y + 1) - 1 <= lastDay + 16; y++) {
    const id = startMonth === 1 ? `${y}` : `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    out.push({ id, start: startOf(y), end: startOf(y + 1) - 1 });
  }
  return out;
}

/** Date where the series crosses `level` between cells i (below) and i + 1 (at or above, or the reverse). */
function crossingDay(g: GridView, i: number, level: number): number {
  const a = g.values[i] as number;
  const b = g.values[i + 1] as number;
  return Math.round(dayOf(g, i) + ((level - a) / (b - a)) * GRID_STEP);
}

interface Peak {
  i: number;
  v: number;
}

/** Local maxima reduced to distinct crop peaks (separated by a deep, long enough trough). */
function distinctPeaks(g: GridView, cells: number[], opts: MemoryOptions): Peak[] {
  const kept: Peak[] = [];
  const at = (k: number): number => g.values[cells[k] as number] as number;
  for (let k = 0; k < cells.length; k++) {
    const v = at(k);
    if (v < opts.cropPeakMin || (k > 0 && at(k - 1) > v) || (k < cells.length - 1 && at(k + 1) > v))
      continue;
    if (k > 0 && at(k - 1) === v) continue; // a plateau counts once, at its first cell
    const cand: Peak = { i: cells[k] as number, v };
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(cand);
      continue;
    }
    let trough = Number.POSITIVE_INFINITY;
    for (let c = last.i; c <= cand.i; c++) trough = Math.min(trough, g.values[c] as number);
    const separate =
      Math.min(last.v, cand.v) - trough >= DOUBLE_PROMINENCE &&
      (cand.i - last.i) * GRID_STEP >= DOUBLE_MIN_SEPARATION_DAYS;
    if (separate) kept.push(cand);
    else if (cand.v > last.v) kept[kept.length - 1] = cand;
  }
  return kept;
}

const inMonths = (day: number, [lo, hi]: [number, number]): boolean => {
  const m = fromDayNumber(day).month;
  return m >= lo && m <= hi;
};

const lower = (c: Confidence, steps: number): Confidence =>
  LEVELS[Math.max(0, LEVELS.indexOf(c) - steps)] as Confidence;

function crossCheck(
  r: {
    green_up?: number | undefined;
    peak_date?: number | undefined;
    senescence?: number | undefined;
  },
  ref: ReferenceSeason | undefined,
  tolerance: number,
): CrossCheck | undefined {
  if (!ref) return undefined;
  const deltaDays: CrossCheck["deltaDays"] = {};
  for (const key of ["green_up", "peak_date", "senescence"] as const) {
    const ours = r[key];
    const theirs = ref[key];
    if (ours != null && theirs != null) deltaDays[key] = ours - toDayNumber(theirs);
  }
  const deltas = Object.values(deltaDays);
  if (deltas.length === 0) return undefined;
  return { agrees: deltas.every((d) => Math.abs(d) <= tolerance), deltaDays };
}

/** Bare windows of a season: unbroken runs of cells below the threshold that last long enough. */
function bareRuns(g: GridView, cells: number[], threshold: number, minDays: number, end: number) {
  const runs: { first: number; last: number; start: number; endDay: number }[] = [];
  let s = -1;
  const close = (k: number): void => {
    if (s < 0) return;
    const first = cells[s] as number;
    const last = cells[k] as number;
    const start = dayOf(g, first);
    const endDay = Math.min(dayOf(g, last) + GRID_STEP - 1, end);
    if (endDay - start + 1 >= minDays) runs.push({ first, last, start, endDay });
    s = -1;
  };
  cells.forEach((c, k) => {
    const v = g.values[c];
    if (v != null && v < threshold && (s < 0 || (c as number) - (cells[k - 1] as number) === 1)) {
      if (s < 0) s = k;
    } else {
      close(k - 1);
      if (v != null && v < threshold) s = k;
    }
  });
  close(cells.length - 1);
  return runs;
}

export interface SeasonAnalysis {
  result: SeasonResult;
  /** Grid cells inside a qualifying bare window. */
  bareCells: Set<number>;
  cells: number[];
}

export function analyseSeason(
  g: GridView,
  span: SeasonSpan,
  threshold: number,
  opts: MemoryOptions,
  reference?: ReferenceSeason,
): SeasonAnalysis {
  const cells: number[] = [];
  for (let i = 0; i < g.values.length; i++) {
    const d = dayOf(g, i);
    if (d >= span.start && d <= span.end) cells.push(i);
  }
  const valid = cells.filter((c) => g.values[c] != null);
  const coverage = cells.length === 0 ? 0 : valid.length / cells.length;
  const period = { start: toIsoDate(span.start), end: toIsoDate(span.end) };
  const bareCells = new Set<number>();

  const base = (label: SeasonLabel, confidence: Confidence, extra: Partial<SeasonResult> = {}) => {
    const phenology: PhenologySeason = {
      season: span.id,
      period,
      inferred: { crop: cropId(label), confidence },
      bare_windows: [],
      ...extra.phenology,
    };
    return { label, bareDays: 0, coverage, insufficient: false, ...extra, phenology };
  };

  if (coverage < opts.minCoverage || valid.length < 3) {
    return { result: base("uncertain", "low", { insufficient: true }), bareCells, cells };
  }

  const vals = valid.map((c) => g.values[c] as number);
  let peakCell = valid[0] as number;
  for (const c of valid) if ((g.values[c] as number) > (g.values[peakCell] as number)) peakCell = c;
  const peak = g.values[peakCell] as number;
  const peakDay = dayOf(g, peakCell);
  const amplitude = peak - Math.min(...vals);
  const integral = vals.reduce((s, v) => s + v, 0) * GRID_STEP;

  const runs = bareRuns(g, cells, threshold, opts.minBareDays, span.end);
  for (const r of runs) for (let c = r.first; c <= r.last; c++) bareCells.add(c);
  const bare_windows = runs.map((r) => ({ start: toIsoDate(r.start), end: toIsoDate(r.endDay) }));
  const bareDays = runs.reduce((s, r) => s + (r.endDay - r.start + 1), 0);

  // Label.
  const peaks = distinctPeaks(g, valid, opts);
  const isDouble =
    peaks.length >= 2 &&
    peaks.some((p) => inMonths(dayOf(g, p.i), opts.winterPeakMonths)) &&
    peaks.some((p) => inMonths(dayOf(g, p.i), opts.summerPeakMonths));
  let label: SeasonLabel;
  if (isDouble) label = "double_crop";
  else if (peak < opts.fallowPeakMax || amplitude < opts.fallowAmplitudeMax)
    label = "fallow_or_bare";
  else if (inMonths(peakDay, opts.winterPeakMonths)) label = "winter_crop";
  else if (inMonths(peakDay, opts.summerPeakMonths)) label = "summer_crop";
  else label = "uncertain";

  // Timing of the main cycle (crops only: a fallow has no cycle worth dating).
  let greenUp: number | undefined;
  let senescence: number | undefined;
  if (label !== "fallow_or_bare" && label !== "uncertain") {
    const before = valid.filter((c) => c < peakCell);
    const after = valid.filter((c) => c > peakCell);
    const minBefore = before.length
      ? Math.min(...before.map((c) => g.values[c] as number))
      : undefined;
    const minAfter = after.length
      ? Math.min(...after.map((c) => g.values[c] as number))
      : undefined;
    if (minBefore !== undefined && peak - minBefore > 0) {
      const level = minBefore + CROSSING * (peak - minBefore);
      for (let k = before.length - 1; k >= 0; k--) {
        const c = before[k] as number;
        // A crossing inside a gap is not dated (skipping on would pair two cells below the level).
        if ((g.values[c] as number) < level) {
          if (g.values[c + 1] != null) greenUp = crossingDay(g, c, level);
          break;
        }
      }
    }
    if (minAfter !== undefined && peak - minAfter > 0) {
      const level = minAfter + CROSSING * (peak - minAfter);
      for (const c of after) {
        if ((g.values[c] as number) < level) {
          if (g.values[c - 1] != null) senescence = crossingDay(g, c - 1, level);
          break;
        }
      }
    }
  }

  // Confidence: start high, step down for each weak point.
  const observed = cells.filter((c) => g.flags[c] === 0).length / cells.length;
  const cc = crossCheck(
    { green_up: greenUp, peak_date: peakDay, senescence },
    reference,
    opts.crossCheckToleranceDays,
  );
  let steps = 0;
  if (coverage < 0.85 || observed < 0.4) steps++;
  if (label === "winter_crop" || label === "summer_crop") {
    if (peak < opts.cropPeakMin + 0.1) steps++;
    const [lo, hi] = label === "winter_crop" ? opts.winterPeakMonths : opts.summerPeakMonths;
    const m = fromDayNumber(peakDay);
    if ((m.month === lo && m.day < 10) || (m.month === hi && m.day > 20)) steps++;
  } else if (
    label === "fallow_or_bare" &&
    peak >= opts.fallowPeakMax - 0.05 &&
    amplitude >= opts.fallowAmplitudeMax
  ) {
    steps++;
  } else if (label === "uncertain") steps = 2;
  if (cc && !cc.agrees) steps++;

  const phenology: PhenologySeason = {
    season: span.id,
    period,
    inferred: {
      crop: cropId(label),
      confidence: lower("high", steps),
    },
    peak_ndvi: Math.round(peak * 1000) / 1000,
    bare_windows,
  };
  if (label !== "fallow_or_bare") phenology.peak_date = toIsoDate(peakDay);
  if (greenUp !== undefined) phenology.green_up = toIsoDate(greenUp);
  if (senescence !== undefined) phenology.senescence = toIsoDate(senescence);

  return {
    result: {
      phenology,
      label,
      amplitude: Math.round(amplitude * 1000) / 1000,
      integral: Math.round(integral * 10) / 10,
      bareDays,
      coverage: Math.round(coverage * 1000) / 1000,
      insufficient: false,
      ...(cc ? { crossCheck: cc } : {}),
    },
    bareCells,
    cells,
  };
}

/** Month × season matrix of the share of valid grid cells that sit inside a bare window. */
export function bareMatrix(
  g: GridView,
  analyses: SeasonAnalysis[],
  startMonth: number,
): BareMatrix {
  const months = Array.from({ length: 12 }, (_, k) => ((startMonth - 1 + k) % 12) + 1);
  const rows = analyses.map(({ result, bareCells, cells }) => {
    const total = new Array<number>(12).fill(0);
    const bare = new Array<number>(12).fill(0);
    if (!result.insufficient) {
      for (const c of cells) {
        if (g.values[c] == null) continue;
        const slot = months.indexOf(fromDayNumber(dayOf(g, c)).month);
        total[slot] = (total[slot] as number) + 1;
        if (bareCells.has(c)) bare[slot] = (bare[slot] as number) + 1;
      }
    }
    return {
      season: result.phenology.season,
      bareShare: total.map((t, s) =>
        t === 0 ? null : Math.round(((bare[s] as number) / t) * 1000) / 1000,
      ),
    };
  });
  return { months, rows };
}
