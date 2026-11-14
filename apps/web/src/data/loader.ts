import type { AdapterRegistry, BrowserAdapter } from "@itza/adapters-browser";
import { type CanonicalSeries, type FieldBundle, type Gap, validate } from "@itza/engine/contracts";
import { type BundleCache, bundleCacheKey, heroCacheKey } from "./cache";
import {
  areaHa,
  centroid,
  type FieldGeometry,
  fieldId,
  roundGeometry,
  sha256Hex,
} from "./geometry";
import { mergeSeries, missingVariableGaps } from "./merge";
import { fetchServerSeries, type ScienceDeps } from "./science";
import type { BundleSnapshot, LoadOptions, Period, SourceStates } from "./types";

export const HERO_SOURCE = "hero_bundle";
export const SCIENCE_SOURCE = "science_api";

export interface LoaderDeps {
  registry: AdapterRegistry;
  science: ScienceDeps;
  cache: BundleCache;
  fetch: typeof fetch;
  /** Where precomputed hero bundles are served from, for example `/bundles`. */
  heroBaseUrl: string;
  now: () => Date;
}

type Soil = FieldBundle["soil"];
interface Patch {
  series?: CanonicalSeries[];
  gaps?: Gap[];
  soil?: Soil;
}

const ELEVATION_GAP: Gap = {
  var: "elevation",
  reason: "elevation and slope are not computed yet",
  severity: "info",
};

/** 2001 to the end of last year: the history the replay uses. */
export function defaultPeriod(now: Date): Period {
  return { start: "2001-01-01", end: `${now.getUTCFullYear() - 1}-12-31` };
}

function dedupe(gaps: Gap[]): Gap[] {
  const seen = new Set<string>();
  return gaps.filter((g) => {
    const key = `${g.var}|${g.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function manifestVersion(registry: AdapterRegistry): Promise<string> {
  const text = registry.manifest.sources
    .map((s) => `${s.id}@${s.version}`)
    .sort()
    .join(",");
  return (await sha256Hex(text)).slice(0, 12);
}

function emptyBundle(id: string, geometry: FieldGeometry, now: Date): FieldBundle {
  return {
    schema: "field-bundle/1.0",
    field: {
      id,
      geometry,
      area_ha: areaHa(geometry),
      centroid: centroid(geometry),
      elevation_m: 0,
      slope_mean_deg: 0,
    },
    generated_at: now.toISOString(),
    series: [],
    phenology: [],
    layers: {},
    context: {},
    soil: {},
    gaps: [ELEVATION_GAP],
  };
}

function failureGap(variable: string, source: string): Gap {
  return { var: variable, reason: `${source} failed unexpectedly`, severity: "warning" };
}

/**
 * Builds `loadFieldBundle(geometry, options)`: an async stream of bundle snapshots. Hero fields
 * come from the cache or `public/bundles/<id>/`; other fields are assembled from the browser
 * adapters and the science API in parallel, emitting a snapshot each time a source finishes.
 * Missing sources become `gaps[]`; the bundle stays schema-valid and usable.
 */
export function createBundleLoader(deps: LoaderDeps) {
  const { registry } = deps;
  const chains: Record<string, string[]> = {};
  for (const source of [registry.manifest.priority, registry.manifest.browser_priority]) {
    for (const [variable, ids] of Object.entries(source)) {
      chains[variable] = [...(chains[variable] ?? []), ...ids];
    }
  }

  async function fetchHero(heroId: string, signal: AbortSignal | undefined): Promise<FieldBundle> {
    const response = await deps.fetch(`${deps.heroBaseUrl}/${heroId}/bundle.json`, {
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const checked = validate("field-bundle", await response.json());
    if (!checked.ok) throw new Error("precomputed bundle failed validation");
    return checked.data;
  }

  async function* loadHero(
    geometry: FieldGeometry,
    heroId: string,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<BundleSnapshot, boolean> {
    const key = heroCacheKey(heroId);
    const cached = await deps.cache.get(key);
    if (cached) {
      yield {
        bundle: cached.bundle,
        sources: { [HERO_SOURCE]: "done" },
        complete: true,
        fromCache: true,
      };
      // Revalidate so a replaced static bundle (for example after #17) reaches returning users.
      const fresh = await fetchHero(heroId, signal).catch(() => undefined);
      if (fresh && fresh.generated_at !== cached.bundle.generated_at) {
        await deps.cache.set(key, {
          bundle: fresh,
          complete: true,
          savedAt: deps.now().toISOString(),
        });
        yield {
          bundle: fresh,
          sources: { [HERO_SOURCE]: "done" },
          complete: true,
          fromCache: false,
        };
      }
      return true;
    }
    const skeleton = emptyBundle(await fieldId(geometry), geometry, deps.now());
    yield {
      bundle: skeleton,
      sources: { [HERO_SOURCE]: "loading" },
      complete: false,
      fromCache: false,
    };
    try {
      const bundle = await fetchHero(heroId, signal);
      await deps.cache.set(key, {
        bundle,
        complete: true,
        savedAt: deps.now().toISOString(),
      });
      yield { bundle, sources: { [HERO_SOURCE]: "done" }, complete: true, fromCache: false };
      return true;
    } catch {
      if (signal?.aborted) return true;
      return false;
    }
  }

  return async function* loadFieldBundle(
    geometryInput: FieldGeometry,
    options: LoadOptions = {},
  ): AsyncGenerator<BundleSnapshot> {
    const { signal } = options;
    const geometry = roundGeometry(geometryInput);
    if (options.heroId) {
      const served = yield* loadHero(geometry, options.heroId, signal);
      if (served) return;
    }

    const now = deps.now();
    const period = options.period ?? defaultPeriod(now);
    const id = await fieldId(geometry);
    const key = bundleCacheKey(id, await manifestVersion(registry), period);
    const cached = await deps.cache.get(key);
    if (cached) {
      yield {
        bundle: cached.bundle,
        sources: {},
        complete: cached.complete,
        fromCache: true,
      };
      if (cached.complete) return;
    }

    const [lon, lat] = centroid(geometry);
    const plan = new Map<string, { adapter: BrowserAdapter; vars: string[] }>();
    for (const variable of Object.keys(registry.manifest.browser_priority)) {
      for (const adapter of registry.seriesFor(variable)) {
        const entry = plan.get(adapter.id) ?? { adapter, vars: [] };
        entry.vars.push(variable);
        plan.set(adapter.id, entry);
      }
    }

    const tasks = new Map<string, Promise<{ id: string; patch: Patch; failed: boolean }>>();
    for (const [sourceId, { adapter, vars }] of plan) {
      tasks.set(
        sourceId,
        adapter
          .fetch({ lat, lon, period, variables: vars as CanonicalSeries["var"][] }, signal)
          .then((r) => ({
            id: sourceId,
            patch: r,
            failed: r.series.length === 0 && r.gaps.length > 0,
          }))
          .catch(() => ({
            id: sourceId,
            patch: { gaps: vars.map((v) => failureGap(v, sourceId)) },
            failed: true,
          })),
      );
    }
    const soilAdapter = registry.get("soilgrids");
    if (soilAdapter?.kind === "soil") {
      tasks.set(
        "soilgrids",
        soilAdapter.adapter
          .fetchSoil({ lat, lon }, signal)
          .then((r) => ({ id: "soilgrids", patch: { soil: r.soil, gaps: r.gaps }, failed: false }))
          .catch(() => ({
            id: "soilgrids",
            patch: { gaps: [failureGap("soil", "soilgrids")] },
            failed: true,
          })),
      );
    }
    tasks.set(
      SCIENCE_SOURCE,
      fetchServerSeries(deps.science, geometry, period, signal).then((r) => ({
        id: SCIENCE_SOURCE,
        patch: r,
        failed: r.series.length === 0 && r.gaps.length > 0,
      })),
    );

    const sources: SourceStates = Object.fromEntries([...tasks.keys()].map((k) => [k, "loading"]));
    const candidates: CanonicalSeries[] = [];
    let adapterGaps: Gap[] = [];
    const soil: Soil = {};
    const base = emptyBundle(id, geometry, now);

    const snapshot = (complete: boolean): BundleSnapshot => {
      const merged = mergeSeries(candidates, chains);
      const gaps = dedupe([...adapterGaps, ...merged.gaps, ELEVATION_GAP]);
      if (complete) gaps.push(...missingVariableGaps(Object.keys(chains), merged.series, gaps));
      return {
        bundle: { ...base, series: merged.series, soil, gaps },
        sources: { ...sources },
        complete,
        fromCache: false,
      };
    };

    if (!cached) yield snapshot(false);
    const pending = new Map(tasks);
    while (pending.size > 0) {
      const finished = await Promise.race(pending.values());
      if (signal?.aborted) return;
      pending.delete(finished.id);
      sources[finished.id] = finished.failed ? "error" : "done";
      candidates.push(...(finished.patch.series ?? []));
      adapterGaps = [...adapterGaps, ...(finished.patch.gaps ?? [])];
      for (const [key, incoming] of Object.entries(finished.patch.soil ?? {})) {
        // Server SSURGO wins regardless of which request completes first.
        if (soil[key]?.source !== "ssurgo" || incoming.source === "ssurgo") soil[key] = incoming;
      }
      // While refreshing a cached bundle, keep showing it instead of a partial rebuild.
      if (pending.size > 0 && !cached) yield snapshot(false);
    }

    const final = snapshot(true);
    const checked = validate("field-bundle", final.bundle);
    if (!checked.ok) throw new Error(`Assembled bundle is invalid: ${checked.errors.join("; ")}`);
    const complete = Object.values(sources).every((s) => s === "done");
    if (cached && final.bundle.series.length < cached.bundle.series.length) {
      // The refresh got less than the cache (offline, API down): keep serving the cached bundle.
      yield { bundle: cached.bundle, sources: { ...sources }, complete: true, fromCache: true };
      return;
    }
    await deps.cache.set(key, { bundle: final.bundle, complete, savedAt: now.toISOString() });
    yield final;
  };
}

export type FieldBundleLoader = ReturnType<typeof createBundleLoader>;
