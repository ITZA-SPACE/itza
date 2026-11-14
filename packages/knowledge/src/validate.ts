import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PACK_SCHEMA } from "./schema.ts";

// Build tooling and tests only. It is not exported from the package index, so the app bundle
// carries neither Ajv nor the schema.
const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
addFormats(ajv);
ajv.addKeyword("x-version");
const checkSchema = ajv.compile(PACK_SCHEMA);

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every string stored under a `source` key, at any depth. */
function usedSources(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) usedSources(item, out);
  } else if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "source" && typeof value === "string") out.add(value);
      else usedSources(value, out);
    }
  }
}

const value = (node: unknown): number => (node as { value: number }).value;

/**
 * Checks a pack against the schema, then the rules a schema cannot express: sources exist and are
 * used, ids are unique, stage lengths add up, thresholds are ordered and hosts exist.
 * Returns readable error lines; empty means valid.
 */
export function validatePack(pack: unknown): string[] {
  if (!checkSchema(pack)) {
    return (checkSchema.errors ?? []).map((e) => `${e.instancePath || "/"}: ${e.message}`);
  }
  const p = pack as Json & { id: string };
  const errors: string[] = [];
  const sources = new Set(Object.keys(p.sources as Json));

  const used = new Set<string>();
  usedSources(p.crops, used);
  usedSources(p.pests, used);
  usedSources(p.calendar, used);
  for (const id of used) if (!sources.has(id)) errors.push(`unknown source "${id}"`);
  for (const id of sources) if (!used.has(id)) errors.push(`source "${id}" is never used`);

  const crops = p.crops as Json[];
  const cropIds = new Set<string>();
  for (const c of crops) {
    const id = c.id as string;
    if (cropIds.has(id)) errors.push(`duplicate crop id "${id}"`);
    cropIds.add(id);
    const gaez = c.gaez_suitability as Json | undefined;
    if (p.id === "dz-high-plains" && !gaez) {
      errors.push(`${id}: story crops need GAEZ suitability or explicit not_available`);
    }
    if (gaez) {
      if (gaez.status === "available") {
        if (gaez.value === null || !gaez.gaez_crop || !gaez.raster_url) {
          errors.push(`${id}: available GAEZ evidence needs a class, crop code and raster_url`);
        }
        if (c.kind === "fallow") errors.push(`${id}: fallow cannot have a GAEZ crop class`);
      } else if (gaez.value !== null || gaez.raster_url || gaez.gaez_crop) {
        errors.push(`${id}: not_available GAEZ evidence needs null value and no crop or raster`);
      }
    }
    if (c.kind === "fallow") continue;
    const days = Object.values(c.stage_days as Json).map(value);
    if (days.reduce((a, b) => a + b, 0) !== value(c.season_length_days)) {
      errors.push(`${id}: season_length_days must equal the sum of stage_days`);
    }
    if (!(value(c.t_base_c) < value(c.t_opt_c) && value(c.t_opt_c) < value(c.t_max_c))) {
      errors.push(`${id}: need t_base_c < t_opt_c < t_max_c`);
    }
    if (value(c.root_depth_ini_m) > value(c.root_depth_max_m)) {
      errors.push(`${id}: root_depth_ini_m must not exceed root_depth_max_m`);
    }
  }
  if (crops.filter((c) => c.kind === "fallow").length !== 1 || !cropIds.has("fallow")) {
    errors.push('need exactly one fallow entry, with id "fallow"');
  }

  const pestIds = new Set<string>();
  for (const pest of p.pests as (Json & {
    id: string;
    hosts: { crops: string[]; families: string[] };
  })[]) {
    if (pestIds.has(pest.id)) errors.push(`duplicate pest id "${pest.id}"`);
    pestIds.add(pest.id);
    if (pest.hosts.crops.length + pest.hosts.families.length === 0)
      errors.push(`${pest.id}: no hosts`);
    for (const host of pest.hosts.crops) {
      const target = crops.find((c) => c.id === host);
      if (!target) errors.push(`${pest.id}: unknown host crop "${host}"`);
      else if (target.kind === "fallow") errors.push(`${pest.id}: fallow cannot be a host`);
    }
  }

  const region = p.region as { bbox: number[] | null };
  if (p.generic) {
    if (region.bbox !== null) errors.push("the generic pack must have bbox null");
  } else if (!region.bbox) {
    errors.push("a regional pack needs a bbox");
  } else {
    const [w, s, e, n] = region.bbox as [number, number, number, number];
    if (!(w < e && s < n && w >= -180 && e <= 180 && s >= -90 && n <= 90)) {
      errors.push("bbox must be [minLon, minLat, maxLon, maxLat] within valid ranges");
    }
  }
  return errors;
}
