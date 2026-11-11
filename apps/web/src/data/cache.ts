import { type FieldBundle, validate } from "@itza/engine/contracts";
import { createStore, del, get, set, type UseStore } from "idb-keyval";

export interface CachedBundle {
  bundle: FieldBundle;
  /** False when a source failed; such entries are shown first but refetched. */
  complete: boolean;
  savedAt: string;
}

export interface BundleCache {
  get(key: string): Promise<CachedBundle | undefined>;
  set(key: string, value: CachedBundle): Promise<void>;
  delete(key: string): Promise<void>;
}

let store: UseStore | undefined;

function idbStore(): UseStore {
  store ??= createStore("itza", "field-bundles");
  return store;
}

/**
 * IndexedDB-backed cache. Entries that fail schema validation are dropped, and every failure
 * (no IndexedDB, private window, quota) degrades to "no cache" instead of throwing.
 */
export const idbCache: BundleCache = {
  async get(key) {
    try {
      const entry = await get<CachedBundle>(key, idbStore());
      if (!entry) return undefined;
      if (validate("field-bundle", entry.bundle).ok) return entry;
      await del(key, idbStore());
    } catch {
      // cache unavailable
    }
    return undefined;
  },
  async set(key, value) {
    try {
      await set(key, value, idbStore());
    } catch {
      // cache unavailable
    }
  },
  async delete(key) {
    try {
      await del(key, idbStore());
    } catch {
      // cache unavailable
    }
  },
};

/** Cache key: rounded-geometry hash + manifest versions + period. */
export function bundleCacheKey(
  fieldId: string,
  manifestVersion: string,
  period: { start: string; end: string },
): string {
  return `bundle:${fieldId}:${manifestVersion}:${period.start}:${period.end}`;
}

export const heroCacheKey = (heroId: string) => `hero:${heroId}`;
