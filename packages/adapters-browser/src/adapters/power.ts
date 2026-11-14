import type { SourceEntry } from "../manifest";
import type {
  BrowserAdapter,
  CanonicalSeries,
  CanonicalVar,
  Capabilities,
  FetchRequest,
  FetchResult,
  Gap,
} from "../types";
import { asNumber, compactDate, eachDay, gap, isRecord } from "../util";
import { type AdapterDeps, buildSeries, capabilitiesOf } from "./common";

type Convert = (value: number) => number;
const same: Convert = (x) => x;

/** POWER response units accepted per canonical variable, with the conversion to canonical units. */
const CONVERSIONS: Partial<Record<CanonicalVar, Record<string, Convert>>> = {
  tmax: { C: same },
  tmin: { C: same },
  tmean: { C: same },
  rh: { "%": same },
  wind2m: { "m/s": same },
  precip: { "mm/day": same },
  srad: { "MJ/m^2/day": same, "kW-hr/m^2/day": (x) => x * 3.6 },
  // Latent heat of vaporization: 2.45 MJ per kg (mm) of water.
  et_actual: { "MJ/m^2/day": (x) => x / 2.45, "mm/day": same },
  sm_rootzone: { "1": same },
};

/** Variables that are proxies rather than direct measurements. */
const PROXIES: Partial<
  Record<CanonicalVar, { unit: string; method: string; maxQuality: "medium" | "low" }>
> = {
  et_actual: { unit: "mm/day", method: "latent_heat_conversion", maxQuality: "medium" },
  sm_rootzone: { unit: "fraction", method: "wetness_index_not_volumetric", maxQuality: "low" },
};

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

interface Payload {
  parameter: Record<string, unknown>;
  units: Record<string, unknown>;
  header: Record<string, unknown>;
  fillValue: number;
  version: string | undefined;
}

function parsePayload(data: unknown): Payload | undefined {
  if (!isRecord(data) || !isRecord(data.properties) || !isRecord(data.properties.parameter)) {
    return undefined;
  }
  const header = isRecord(data.header) ? data.header : {};
  const api = isRecord(header.api) ? header.api : {};
  const units: Record<string, unknown> = {};
  if (isRecord(data.parameters)) {
    for (const [name, info] of Object.entries(data.parameters)) {
      units[name] = isRecord(info) ? info.units : undefined;
    }
  }
  return {
    parameter: data.properties.parameter,
    units,
    header,
    fillValue: asNumber(header.fill_value) ?? -999,
    version: typeof api.version === "string" ? api.version : undefined,
  };
}

function clean(raw: unknown, fillValue: number, convert: Convert): number | null {
  const value = asNumber(raw);
  return value === null || value === fillValue ? null : convert(value);
}

function failure(vars: CanonicalVar[], message: string): FetchResult {
  return { series: [], gaps: vars.map((v) => gap(v, message)) };
}

/** Finds the response record for a canonical variable and the unit conversion, or explains why not. */
function resolve(
  entry: SourceEntry,
  variable: CanonicalVar,
  payload: Payload,
): { record: Record<string, unknown>; convert: Convert } | Gap {
  const mapping = entry.variables[variable];
  const record = mapping ? payload.parameter[mapping.source_var] : undefined;
  if (!mapping || !isRecord(record)) {
    return gap(variable, `${entry.product} did not return ${mapping?.source_var ?? variable}`);
  }
  const units = payload.units[mapping.source_var];
  const convert = typeof units === "string" ? CONVERSIONS[variable]?.[units] : undefined;
  if (!convert) {
    return gap(variable, `${entry.product} returned unexpected units for ${mapping.source_var}`);
  }
  return { record, convert };
}

abstract class PowerAdapter implements BrowserAdapter {
  readonly id: string;

  constructor(
    protected readonly entry: SourceEntry,
    protected readonly deps: AdapterDeps,
  ) {
    this.id = entry.id;
  }

  capabilities(): Capabilities {
    return capabilitiesOf(this.entry);
  }

  protected abstract url(req: FetchRequest, vars: CanonicalVar[]): string;
  protected abstract assemble(
    variable: CanonicalVar,
    record: Record<string, unknown>,
    convert: Convert,
    payload: Payload,
    req: FetchRequest,
  ): { series?: CanonicalSeries; gap?: Gap };

  async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
    const vars = req.variables.filter((v) => v in this.entry.variables);
    if (vars.length === 0) return { series: [], gaps: [] };
    const response = await this.deps.http.getJson(this.url(req, vars), signal);
    if (!response.ok) {
      return failure(vars, `${this.entry.product} unavailable: ${response.reason}`);
    }
    const payload = parsePayload(response.data);
    if (!payload) return failure(vars, `${this.entry.product} returned an unexpected response`);
    const result: FetchResult = { series: [], gaps: [] };
    for (const variable of vars) {
      const found = resolve(this.entry, variable, payload);
      if ("severity" in found) {
        result.gaps.push(found);
        continue;
      }
      const built = this.assemble(variable, found.record, found.convert, payload, req);
      if (built.series) result.series.push(built.series);
      if (built.gap) result.gaps.push(built.gap);
    }
    return result;
  }

  protected query(req: FetchRequest, vars: CanonicalVar[]): string {
    const names = vars.map((v) => this.entry.variables[v]?.source_var).join(",");
    return `parameters=${names}&community=AG&longitude=${req.lon}&latitude=${req.lat}&format=JSON`;
  }
}

/** NASA POWER daily point API (MERRA-2 based, about 0.5 by 0.625 degrees). */
export class PowerDailyAdapter extends PowerAdapter {
  protected url(req: FetchRequest, vars: CanonicalVar[]): string {
    const { start, end } = req.period;
    return `${this.entry.endpoint}?${this.query(req, vars)}&start=${compactDate(start)}&end=${compactDate(end)}`;
  }

  protected assemble(
    variable: CanonicalVar,
    record: Record<string, unknown>,
    convert: Convert,
    payload: Payload,
    req: FetchRequest,
  ): { series?: CanonicalSeries; gap?: Gap } {
    const days = eachDay(req.period);
    const values = days.map((day) => clean(record[compactDate(day)], payload.fillValue, convert));
    const missing = values.filter((v) => v === null).length;
    if (missing === values.length) {
      return { gap: gap(variable, `${this.entry.product} has no data for this period`) };
    }
    const proxy = PROXIES[variable];
    const series = buildSeries(this.entry, this.deps, {
      var: variable,
      unit: proxy?.unit ?? this.entry.variables[variable]?.unit ?? "",
      cadence: "daily",
      start: req.period.start,
      values,
      period: req.period,
      method: proxy?.method ?? "point_sample",
      ...(payload.version ? { version: payload.version } : {}),
      ...(proxy ? { maxQuality: proxy.maxQuality } : {}),
    });
    return missing === 0
      ? { series }
      : {
          series,
          gap: gap(variable, `${missing} of ${values.length} days missing`, "info"),
        };
  }
}

/** NASA POWER climatology: 12 monthly normals for 2001-2025. */
export class PowerClimatologyAdapter extends PowerAdapter {
  protected url(req: FetchRequest, vars: CanonicalVar[]): string {
    return `${this.entry.endpoint}?${this.query(req, vars)}`;
  }

  protected assemble(
    variable: CanonicalVar,
    record: Record<string, unknown>,
    convert: Convert,
    payload: Payload,
  ): { series?: CanonicalSeries; gap?: Gap } {
    const values = MONTHS.map((month) => clean(record[month], payload.fillValue, convert));
    if (values.every((v) => v === null)) {
      return { gap: gap(variable, `${this.entry.product} has no normals here`) };
    }
    const startYear = asNumber(payload.header.start) ?? 2001;
    const endYear = asNumber(payload.header.end) ?? 2025;
    const period = { start: `${startYear}-01-01`, end: `${endYear}-12-31` };
    return {
      series: buildSeries(this.entry, this.deps, {
        var: variable,
        unit: this.entry.variables[variable]?.unit ?? "",
        cadence: "monthly",
        start: period.start,
        values,
        period,
        method: "monthly_normals",
        ...(payload.version ? { version: payload.version } : {}),
      }),
    };
  }
}
