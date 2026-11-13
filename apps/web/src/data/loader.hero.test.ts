import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpClient, loadRegistry } from "@itza/adapters-browser";
import type { FieldBundle } from "@itza/engine/contracts";
import { describe, expect, it } from "vitest";
import { type BundleCache, type CachedBundle, heroCacheKey } from "./cache";
import { HERO_FIELDS } from "./hero";
import { createBundleLoader, HERO_SOURCE } from "./loader";
import type { BundleSnapshot } from "./types";

const root = resolve(import.meta.dirname, "../../../..");
const hero = HERO_FIELDS[0];
const real = JSON.parse(
  readFileSync(resolve(root, "apps/web/public/bundles", hero?.id ?? "", "bundle.json"), "utf8"),
) as FieldBundle;
/** What a browser that visited before the real bundles shipped would still hold. */
const stale: FieldBundle = { ...real, generated_at: "2026-01-01T00:00:00+00:00" };

class MemoryCache implements BundleCache {
  entries = new Map<string, CachedBundle>();
  async get(key: string) {
    return this.entries.get(key);
  }
  async set(key: string, value: CachedBundle) {
    this.entries.set(key, value);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
}

function loaderWith(cache: BundleCache, serve: () => Response) {
  const registry = loadRegistry(readFileSync(resolve(root, "data-sources.yaml"), "utf8"), {
    http: new HttpClient(),
  });
  return createBundleLoader({
    registry,
    science: {
      baseUrl: "http://science.test",
      fetch: async () => new Response("{}", { status: 500 }),
      sleep: async () => {},
      timeoutMs: 1,
    },
    cache,
    fetch: async () => serve(),
    heroBaseUrl: "/bundles",
    now: () => new Date("2026-11-13T12:00:00Z"),
  });
}

async function collect(stream: AsyncGenerator<BundleSnapshot>) {
  const snapshots: BundleSnapshot[] = [];
  for await (const snapshot of stream) snapshots.push(snapshot);
  return snapshots;
}

const served = () => new Response(JSON.stringify(real), { status: 200 });

describe("hero bundle loading", () => {
  it("shows a cached older bundle at once, then replaces it with the real one", async () => {
    const cache = new MemoryCache();
    const key = heroCacheKey(hero?.id ?? "");
    await cache.set(key, { bundle: stale, complete: true, savedAt: "2026-01-02T00:00:00Z" });
    const snapshots = await collect(
      loaderWith(cache, served)(hero?.geometry as never, { heroId: hero?.id ?? "" }),
    );

    expect(snapshots.map((s) => [s.fromCache, s.bundle.generated_at])).toEqual([
      [true, stale.generated_at],
      [false, real.generated_at],
    ]);
    expect(snapshots.every((s) => s.sources[HERO_SOURCE] === "done")).toBe(true);
    expect((await cache.get(key))?.bundle.generated_at).toBe(real.generated_at);
  });

  it("does not repeat the bundle when the cached one is already current", async () => {
    const cache = new MemoryCache();
    await cache.set(heroCacheKey(hero?.id ?? ""), {
      bundle: real,
      complete: true,
      savedAt: "2026-11-13T00:00:00Z",
    });
    const snapshots = await collect(
      loaderWith(cache, served)(hero?.geometry as never, { heroId: hero?.id ?? "" }),
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.fromCache).toBe(true);
  });

  it("keeps the cached bundle offline when the static file cannot be fetched", async () => {
    const cache = new MemoryCache();
    await cache.set(heroCacheKey(hero?.id ?? ""), {
      bundle: stale,
      complete: true,
      savedAt: "2026-01-02T00:00:00Z",
    });
    const snapshots = await collect(
      loaderWith(cache, () => new Response("", { status: 503 }))(hero?.geometry as never, {
        heroId: hero?.id ?? "",
      }),
    );
    expect(snapshots.map((s) => s.bundle.generated_at)).toEqual([stale.generated_at]);
  });

  it("loads a fresh bundle from the static files and caches it", async () => {
    const cache = new MemoryCache();
    const snapshots = await collect(
      loaderWith(cache, served)(hero?.geometry as never, { heroId: hero?.id ?? "" }),
    );
    expect(snapshots.at(-1)?.bundle.generated_at).toBe(real.generated_at);
    expect(snapshots.at(-1)?.sources[HERO_SOURCE]).toBe("done");
    expect(cache.entries.has(heroCacheKey(hero?.id ?? ""))).toBe(true);
  });
});
