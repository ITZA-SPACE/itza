import { PACKS } from "./generated/packs.ts";
import type { KnowledgePack } from "./generated/types.ts";

export type CropEntry = KnowledgePack["crops"][number];
export type PestEntry = KnowledgePack["pests"][number];

export interface PackSummary {
  id: string;
  name: string;
  generic: boolean;
  reviewStatus: KnowledgePack["review"]["status"];
  /** [minLon, minLat, maxLon, maxLat], or null for the generic pack. */
  bbox: [number, number, number, number] | null;
}

export class UnknownPackError extends Error {
  constructor(regionId: string) {
    super(`Unknown knowledge pack: ${regionId}`);
    this.name = "UnknownPackError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Packs are validated when they are generated (scripts/build.ts); here they are only indexed.
const byId = new Map<string, KnowledgePack>(PACKS.map((pack) => [pack.id, deepFreeze(pack)]));
const generic = PACKS.find((pack) => pack.generic) as KnowledgePack;

/** The pack for a region id such as `dz-high-plains`. Throws `UnknownPackError` for other ids. */
export function loadPack(regionId: string): KnowledgePack {
  const pack = byId.get(regionId);
  if (!pack) throw new UnknownPackError(regionId);
  return pack;
}

export function listPacks(): PackSummary[] {
  return PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    generic: pack.generic,
    reviewStatus: pack.review.status,
    bbox: pack.region.bbox as PackSummary["bbox"],
  }));
}

/**
 * The pack whose bounding region contains the point (edges included). Outside every region it
 * returns the generic pack with `fallback: true`, so the UI can label the result as generic.
 * Throws `RangeError` for coordinates that are not on Earth.
 */
export function packForLocation(
  lon: number,
  lat: number,
): { pack: KnowledgePack; fallback: boolean } {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new RangeError(`Invalid coordinates: lon ${lon}, lat ${lat}`);
  }
  for (const pack of byId.values()) {
    const box = pack.region.bbox;
    if (box && lon >= box[0] && lat >= box[1] && lon <= box[2] && lat <= box[3]) {
      return { pack, fallback: false };
    }
  }
  return { pack: generic, fallback: true };
}
