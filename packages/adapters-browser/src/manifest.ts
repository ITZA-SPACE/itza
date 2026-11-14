import { parse } from "yaml";
import { CANONICAL_VARS, PHENOLOGY_VARS, SOIL_VARS } from "./canonical";

export type SourceKind = "series" | "soil" | "phenology" | "catalog";

export interface VariableMapping {
  source_var: string;
  unit: string;
}

export interface SourceEntry {
  id: string;
  provider: string;
  product: string;
  version: string;
  runtime: "browser" | "server";
  auth: "none" | "earthdata";
  endpoint?: string;
  kind: SourceKind;
  variables: Record<string, VariableMapping>;
  resolution_m: number;
  /** ISO date, or "near_real_time" for an open end. */
  coverage: { start: string; end: string };
}

export interface Manifest {
  sources: SourceEntry[];
  /** Server chains per canonical variable. */
  priority: Record<string, string[]>;
  /** Browser chains per canonical variable, tried after `priority`. */
  browser_priority: Record<string, string[]>;
}

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; errors: string[] };

const VOCABULARY: Record<Exclude<SourceKind, "catalog">, readonly string[]> = {
  series: CANONICAL_VARS,
  soil: SOIL_VARS,
  phenology: PHENOLOGY_VARS,
};
const KINDS: readonly string[] = ["series", "soil", "phenology", "catalog"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function checkCoverage(
  value: unknown,
  at: string,
  errors: string[],
): { start: string; end: string } {
  const coverage = { start: "", end: "" };
  if (!isRecord(value)) {
    errors.push(`${at}.coverage must be an object with start and end`);
    return coverage;
  }
  if (typeof value.start === "string" && ISO_DATE.test(value.start)) coverage.start = value.start;
  else errors.push(`${at}.coverage.start must be an ISO date`);
  if (typeof value.end === "string" && (ISO_DATE.test(value.end) || value.end === "near_real_time"))
    coverage.end = value.end;
  else errors.push(`${at}.coverage.end must be an ISO date or near_real_time`);
  return coverage;
}

function checkVariables(
  value: unknown,
  kind: SourceKind,
  at: string,
  errors: string[],
): Record<string, VariableMapping> {
  const out: Record<string, VariableMapping> = {};
  if (!isRecord(value)) {
    errors.push(`${at}.variables must be an object`);
    return out;
  }
  for (const [name, spec] of Object.entries(value)) {
    if (kind === "catalog") {
      errors.push(`${at}.variables.${name}: catalog sources cannot declare variables`);
    } else if (!VOCABULARY[kind].includes(name)) {
      errors.push(`${at}.variables.${name}: unknown ${kind} variable`);
    }
    if (isRecord(spec) && isString(spec.source_var) && isString(spec.unit)) {
      out[name] = { source_var: spec.source_var, unit: spec.unit };
    } else {
      errors.push(`${at}.variables.${name} needs source_var and unit`);
    }
  }
  return out;
}

function checkSource(item: unknown, index: number, errors: string[]): SourceEntry | undefined {
  const at = `sources[${index}]`;
  if (!isRecord(item)) {
    errors.push(`${at} must be an object`);
    return undefined;
  }
  const before = errors.length;
  for (const key of ["id", "provider", "product", "version"] as const) {
    if (!isString(item[key])) errors.push(`${at}.${key} is required`);
  }
  if (item.runtime !== "browser" && item.runtime !== "server")
    errors.push(`${at}.runtime must be browser or server`);
  if (item.auth !== "none" && item.auth !== "earthdata")
    errors.push(`${at}.auth must be none or earthdata`);
  const kind = item.kind ?? "series";
  if (typeof kind !== "string" || !KINDS.includes(kind)) {
    errors.push(`${at}.kind must be one of ${KINDS.join(", ")}`);
    return undefined;
  }
  if (item.runtime === "browser" && !isString(item.endpoint))
    errors.push(`${at}.endpoint is required for browser sources`);
  const resolution = item.resolution_m;
  const resolutionOk =
    typeof resolution === "number" &&
    (kind === "catalog" ? resolution === 0 : kind === "soil" ? resolution >= 0 : resolution > 0);
  if (!resolutionOk)
    errors.push(`${at}.resolution_m must be positive (0 for catalog or vector soil sources)`);
  const variables = checkVariables(item.variables, kind as SourceKind, at, errors);
  const coverage = checkCoverage(item.coverage, at, errors);
  if (errors.length > before) return undefined;
  const entry: SourceEntry = {
    id: item.id as string,
    provider: item.provider as string,
    product: item.product as string,
    version: String(item.version),
    runtime: item.runtime as SourceEntry["runtime"],
    auth: item.auth as SourceEntry["auth"],
    kind: kind as SourceKind,
    variables,
    resolution_m: resolution as number,
    coverage,
  };
  if (isString(item.endpoint)) entry.endpoint = item.endpoint;
  return entry;
}

function checkChains(
  raw: unknown,
  name: string,
  sources: SourceEntry[],
  errors: string[],
): Record<string, string[]> {
  const chains: Record<string, string[]> = {};
  if (raw === undefined) return chains;
  if (!isRecord(raw)) {
    errors.push(`${name} must be an object`);
    return chains;
  }
  for (const [variable, list] of Object.entries(raw)) {
    if (!(CANONICAL_VARS as readonly string[]).includes(variable)) {
      errors.push(`${name}.${variable}: unknown canonical variable`);
      continue;
    }
    if (!Array.isArray(list) || !list.every(isString)) {
      errors.push(`${name}.${variable} must be a list of source ids`);
      continue;
    }
    for (const id of list) {
      const source = sources.find((s) => s.id === id);
      if (!source) errors.push(`${name}.${variable}: unknown source ${id}`);
      else if (!(variable in source.variables))
        errors.push(`${name}.${variable}: ${id} does not provide ${variable}`);
    }
    chains[variable] = list;
  }
  return chains;
}

/** Validates a parsed manifest. Unknown variables, duplicate ids and bad priority lists are errors. */
export function validateManifest(raw: unknown): ManifestResult {
  const errors: string[] = [];
  if (!isRecord(raw) || !Array.isArray(raw.sources)) {
    return { ok: false, errors: ["manifest must have a sources list"] };
  }
  const sources: SourceEntry[] = [];
  raw.sources.forEach((item, index) => {
    const entry = checkSource(item, index, errors);
    if (entry) sources.push(entry);
  });
  const ids = new Set<string>();
  for (const { id } of sources) {
    if (ids.has(id)) errors.push(`duplicate source id: ${id}`);
    ids.add(id);
  }
  const priority = checkChains(raw.priority, "priority", sources, errors);
  const browserPriority = checkChains(raw.browser_priority, "browser_priority", sources, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: { sources, priority, browser_priority: browserPriority } };
}

/** Parses and validates the text of data-sources.yaml; throws with every error listed. */
export function parseManifest(yamlText: string): Manifest {
  const result = validateManifest(parse(yamlText));
  if (!result.ok) throw new Error(`Invalid data-sources.yaml:\n${result.errors.join("\n")}`);
  return result.manifest;
}

/** Sources for `variable`: server chain first, then the browser chain, without repeats. */
export function sourcesFor(manifest: Manifest, variable: string): SourceEntry[] {
  const ids = [
    ...(manifest.priority[variable] ?? []),
    ...(manifest.browser_priority[variable] ?? []),
  ];
  return [...new Set(ids)].flatMap((id) => manifest.sources.filter((s) => s.id === id));
}
