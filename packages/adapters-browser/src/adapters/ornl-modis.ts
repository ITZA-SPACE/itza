import type { SourceEntry } from "../manifest";
import type {
  BrowserAdapter,
  CanonicalSeries,
  Capabilities,
  FetchRequest,
  FetchResult,
  Gap,
  Provenance,
} from "../types";
import { addDays, asNumber, daysBetween, gap, isoDate, isRecord, todayIso } from "../util";
import { type AdapterDeps, buildSeries, capabilitiesOf } from "./common";

/** ORNL limits a subset request to ten composites, so longer ranges are requested in chunks. */
const CHUNK = 10;
const CONCURRENCY = 4;
const NDVI_FILL = -3000;
const NDVI_QA_BAND = "250m_16_days_VI_Quality";
/** MODIS ET and phenology products mark fill values at or above this raw value. */
const FILL_FROM = 32761;
const ET_COMPOSITE_DAYS = 8;
const DAY_MS = 86_400_000;

interface Composite {
  modis: string;
  iso: string;
}

type Pixels = Map<string, number[]>;
interface BandData {
  pixels: Pixels;
  scale: number;
}
type ChunkBands = Record<string, BandData>;
type Chunk = { ok: true; bands: ChunkBands } | { ok: false; reason: string };

interface Collected {
  /** Per band, pixels of every chunk that succeeded. */
  bands: Record<string, BandData>;
  failed: number;
  total: number;
  reason: string;
}

function parseDates(data: unknown): Composite[] | undefined {
  if (!isRecord(data) || !Array.isArray(data.dates)) return undefined;
  const out: Composite[] = [];
  for (const item of data.dates) {
    if (!isRecord(item)) return undefined;
    if (typeof item.modis_date !== "string" || typeof item.calendar_date !== "string") {
      return undefined;
    }
    out.push({ modis: item.modis_date, iso: item.calendar_date });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

function parseSubset(data: unknown): BandData | undefined {
  if (!isRecord(data) || !Array.isArray(data.subset)) return undefined;
  const pixels: Pixels = new Map();
  for (const item of data.subset) {
    if (!isRecord(item) || typeof item.calendar_date !== "string" || !Array.isArray(item.data)) {
      return undefined;
    }
    pixels.set(
      item.calendar_date,
      item.data.filter((v): v is number => asNumber(v) !== null),
    );
  }
  const scale = Number(data.scale);
  return { pixels, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(average * 1e6) / 1e6;
}

/** ORNL DAAC MODIS REST access shared by the three MODIS adapters. Never throws. */
class OrnlClient {
  constructor(
    private readonly entry: SourceEntry,
    private readonly deps: AdapterDeps,
  ) {}

  async dates(
    req: FetchRequest,
    signal?: AbortSignal,
  ): Promise<{ ok: true; dates: Composite[] } | { ok: false; reason: string }> {
    const url = `${this.entry.endpoint}/dates?latitude=${req.lat}&longitude=${req.lon}`;
    const response = await this.deps.http.getJson(url, signal);
    if (!response.ok) return { ok: false, reason: response.reason };
    const dates = parseDates(response.data);
    return dates ? { ok: true, dates } : { ok: false, reason: "unexpected date list" };
  }

  private async chunk(
    req: FetchRequest,
    bands: string[],
    composites: Composite[],
    signal?: AbortSignal,
  ): Promise<Chunk> {
    const first = composites[0];
    const last = composites[composites.length - 1];
    if (!first || !last) return { ok: false, reason: "empty chunk" };
    const parts = await Promise.all(
      bands.map(async (band) => {
        const url =
          `${this.entry.endpoint}/subset?latitude=${req.lat}&longitude=${req.lon}&band=${band}` +
          `&startDate=${first.modis}&endDate=${last.modis}&kmAboveBelow=0&kmLeftRight=0`;
        const response = await this.deps.http.getJson(url, signal);
        if (!response.ok) return { band, reason: response.reason };
        const data = parseSubset(response.data);
        return data ? { band, data } : { band, reason: "unexpected subset response" };
      }),
    );
    const result: ChunkBands = {};
    for (const part of parts) {
      if ("reason" in part) return { ok: false, reason: part.reason };
      result[part.band] = part.data;
    }
    return { ok: true, bands: result };
  }

  /** Requests every band for every composite. A failed chunk leaves its dates out of the result. */
  async collect(
    req: FetchRequest,
    bands: string[],
    composites: Composite[],
    signal?: AbortSignal,
  ): Promise<Collected> {
    const chunks: Composite[][] = [];
    for (let i = 0; i < composites.length; i += CHUNK) chunks.push(composites.slice(i, i + CHUNK));
    const results: Chunk[] = [];
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const index = next++;
        results[index] = await this.chunk(req, bands, chunks[index] ?? [], signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
    const merged: Record<string, BandData> = {};
    let failed = 0;
    let reason = "";
    for (const result of results) {
      if (!result.ok) {
        failed++;
        reason = result.reason;
        continue;
      }
      for (const [band, data] of Object.entries(result.bands)) {
        const target = merged[band] ?? { pixels: new Map(), scale: data.scale };
        for (const [date, pixels] of data.pixels) target.pixels.set(date, pixels);
        merged[band] = target;
      }
    }
    return { bands: merged, failed, total: chunks.length, reason };
  }
}

function failedChunks(entry: SourceEntry, variable: string, collected: Collected): Gap | undefined {
  if (collected.failed === 0) return undefined;
  return gap(
    variable,
    `${entry.product}: ${collected.failed} of ${collected.total} requests failed (${collected.reason})`,
  );
}

abstract class OrnlAdapter {
  readonly id: string;
  protected readonly client: OrnlClient;

  constructor(
    protected readonly entry: SourceEntry,
    protected readonly deps: AdapterDeps,
  ) {
    this.id = entry.id;
    this.client = new OrnlClient(entry, deps);
  }

  capabilities(): Capabilities {
    return capabilitiesOf(this.entry);
  }
}

/** MODIS MOD13Q1 NDVI (250 m, 16-day) with VI-quality masking. */
export class Mod13q1Adapter extends OrnlAdapter implements BrowserAdapter {
  async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
    if (!req.variables.includes("ndvi")) return { series: [], gaps: [] };
    const listed = await this.client.dates(req, signal);
    if (!listed.ok) {
      return {
        series: [],
        gaps: [gap("ndvi", `${this.entry.product} unavailable: ${listed.reason}`)],
      };
    }
    const composites = listed.dates.filter(
      (d) => d.iso >= req.period.start && d.iso <= req.period.end,
    );
    if (composites.length === 0) {
      return {
        series: [],
        gaps: [gap("ndvi", `${this.entry.product} has no composites in this period`)],
      };
    }
    const ndviBand = this.entry.variables.ndvi?.source_var ?? "";
    const collected = await this.client.collect(req, [ndviBand, NDVI_QA_BAND], composites, signal);
    const ndvi = collected.bands[ndviBand];
    const qa = collected.bands[NDVI_QA_BAND];
    const values = composites.map((c) => {
      const pixels = ndvi?.pixels.get(c.iso);
      const flags = qa?.pixels.get(c.iso);
      if (!pixels || !flags || !ndvi) return null;
      const usable = pixels
        .map((v, i) => ({ v, qa: flags[i] ?? 3 }))
        // MODLAND QA (bits 0-1): 0 good, 1 check other QA, 2 likely cloudy, 3 not produced.
        .filter(({ v, qa: q }) => v !== NDVI_FILL && (q & 3) < 2)
        .map(({ v }) => v * ndvi.scale);
      return mean(usable);
    });
    const gaps: Gap[] = [];
    const failed = failedChunks(this.entry, "ndvi", collected);
    if (failed) gaps.push(failed);
    const missing = values.filter((v) => v === null).length;
    if (missing === values.length) {
      gaps.push(gap("ndvi", `${this.entry.product} has no usable NDVI in this period`));
      return { series: [], gaps };
    }
    if (missing > 0 && !failed) {
      gaps.push(
        gap(
          "ndvi",
          `${missing} of ${values.length} composites masked as cloudy or missing`,
          "info",
        ),
      );
    }
    const first = composites[0];
    const series = buildSeries(this.entry, this.deps, {
      var: "ndvi",
      unit: "unitless",
      cadence: "16day",
      start: first?.iso ?? req.period.start,
      values,
      period: req.period,
      method: "point_pixel_qa_masked",
    });
    return { series: [series], gaps };
  }
}

/** MODIS MOD16A2GF actual ET (500 m, 8-day gap-filled), expanded to a daily rate in mm/day. */
export class Mod16a2gfAdapter extends OrnlAdapter implements BrowserAdapter {
  async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
    if (!req.variables.includes("et_actual")) return { series: [], gaps: [] };
    const listed = await this.client.dates(req, signal);
    if (!listed.ok) {
      return {
        series: [],
        gaps: [gap("et_actual", `${this.entry.product} unavailable: ${listed.reason}`)],
      };
    }
    const all = listed.dates;
    const spans = all.map((c, i) => {
      const nextYear = `${Number(c.iso.slice(0, 4)) + 1}-01-01`;
      const next = all[i + 1]?.iso ?? nextYear;
      return Math.min(ET_COMPOSITE_DAYS, daysBetween(c.iso, next));
    });
    const overlapping = all.filter((c, i) => {
      const end = addDays(c.iso, (spans[i] ?? 1) - 1);
      return end >= req.period.start && c.iso <= req.period.end;
    });
    if (overlapping.length === 0) {
      return {
        series: [],
        gaps: [gap("et_actual", `${this.entry.product} has no composites in this period`)],
      };
    }
    const band = this.entry.variables.et_actual?.source_var ?? "";
    const collected = await this.client.collect(req, [band], overlapping, signal);
    const data = collected.bands[band];
    const perDay = new Map<string, number>();
    for (const c of overlapping) {
      const raw = (data?.pixels.get(c.iso) ?? []).filter((v) => v < FILL_FROM);
      const value = mean(raw.map((v) => (v * (data?.scale ?? 1)) / ET_COMPOSITE_DAYS));
      const span = spans[all.indexOf(c)] ?? ET_COMPOSITE_DAYS;
      if (value !== null) for (let d = 0; d < span; d++) perDay.set(addDays(c.iso, d), value);
    }
    const values: (number | null)[] = [];
    for (let d = req.period.start; d <= req.period.end; d = addDays(d, 1)) {
      values.push(perDay.get(d) ?? null);
    }
    const gaps: Gap[] = [];
    const failed = failedChunks(this.entry, "et_actual", collected);
    if (failed) gaps.push(failed);
    const missing = values.filter((v) => v === null).length;
    if (missing === values.length) {
      gaps.push(gap("et_actual", `${this.entry.product} has no usable ET in this period`));
      return { series: [], gaps };
    }
    if (missing > 0 && !failed) {
      gaps.push(gap("et_actual", `${missing} of ${values.length} days without ET`, "info"));
    }
    return {
      series: [
        buildSeries(this.entry, this.deps, {
          var: "et_actual",
          unit: "mm/day",
          cadence: "daily",
          start: req.period.start,
          values,
          period: req.period,
          method: "8day_composite_daily_rate",
        }),
      ],
      gaps,
    };
  }
}

export interface PhenologySeason {
  year: number;
  greenup: string | null;
  peak: string | null;
  dormancy: string | null;
}

export interface PhenologyResult {
  provenance: Provenance;
  seasons: PhenologySeason[];
  gaps: Gap[];
}

/** MODIS MCD12Q2 land-surface phenology dates (500 m, yearly). Cross-check for Field Memory. */
export class Mcd12q2Adapter extends OrnlAdapter {
  async fetchPhenology(req: FetchRequest, signal?: AbortSignal): Promise<PhenologyResult> {
    const startYear = Number(req.period.start.slice(0, 4));
    const endYear = Number(req.period.end.slice(0, 4));
    const provenance: Provenance = {
      source: this.entry.id,
      product: this.entry.product,
      version: this.entry.version,
      resolution_m: this.entry.resolution_m,
      period: req.period,
      quality: "medium",
      method: "point_pixel",
      retrieved: todayIso((this.deps.now ?? (() => new Date()))()),
    };
    const listed = await this.client.dates(req, signal);
    if (!listed.ok) {
      return {
        provenance,
        seasons: [],
        gaps: [gap("phenology", `${this.entry.product} unavailable: ${listed.reason}`)],
      };
    }
    const composites = listed.dates.filter((d) => {
      const year = Number(d.iso.slice(0, 4));
      return year >= startYear && year <= endYear;
    });
    if (composites.length === 0) {
      return {
        provenance,
        seasons: [],
        gaps: [gap("phenology", `${this.entry.product} has no seasons in this period`)],
      };
    }
    const fields = ["greenup", "peak", "dormancy"] as const;
    const bands = fields.map((f) => this.entry.variables[f]?.source_var ?? "");
    const collected = await this.client.collect(req, bands, composites, signal);
    const seasons: PhenologySeason[] = [];
    const gaps: Gap[] = [];
    const failed = failedChunks(this.entry, "phenology", collected);
    if (failed) gaps.push(failed);
    for (const c of composites) {
      const season: PhenologySeason = {
        year: Number(c.iso.slice(0, 4)),
        greenup: null,
        peak: null,
        dormancy: null,
      };
      fields.forEach((field, i) => {
        const raw = (collected.bands[bands[i] ?? ""]?.pixels.get(c.iso) ?? []).find(
          (v) => v > 0 && v < FILL_FROM,
        );
        if (raw !== undefined) season[field] = isoDate(new Date(raw * DAY_MS));
      });
      if (!season.greenup && !season.peak && !season.dormancy) {
        if (!failed)
          gaps.push(gap("phenology", `no phenology detected for ${season.year}`, "info"));
        continue;
      }
      seasons.push(season);
    }
    return { provenance, seasons, gaps };
  }
}

export type { CanonicalSeries };
