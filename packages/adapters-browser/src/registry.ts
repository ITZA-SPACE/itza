import { CmrAdapter } from "./adapters/cmr";
import type { AdapterDeps } from "./adapters/common";
import { Mcd12q2Adapter, Mod13q1Adapter, Mod16a2gfAdapter } from "./adapters/ornl-modis";
import { PowerClimatologyAdapter, PowerDailyAdapter } from "./adapters/power";
import { SoilGridsAdapter } from "./adapters/soilgrids";
import { type Manifest, parseManifest, type SourceEntry, type SourceKind } from "./manifest";
import type { BrowserAdapter } from "./types";

export type AnyAdapter =
  | { kind: "series"; adapter: BrowserAdapter }
  | { kind: "phenology"; adapter: Mcd12q2Adapter }
  | { kind: "soil"; adapter: SoilGridsAdapter }
  | { kind: "catalog"; adapter: CmrAdapter };

type Factory = (entry: SourceEntry, deps: AdapterDeps) => AnyAdapter;

/** Adding a browser source = a manifest entry + an adapter class + a line here + a conformance test. */
const FACTORIES: Record<string, Factory> = {
  nasa_power_daily: (e, d) => ({ kind: "series", adapter: new PowerDailyAdapter(e, d) }),
  nasa_power_climatology: (e, d) => ({
    kind: "series",
    adapter: new PowerClimatologyAdapter(e, d),
  }),
  ornl_modis_mod13q1: (e, d) => ({ kind: "series", adapter: new Mod13q1Adapter(e, d) }),
  ornl_modis_mod16a2gf: (e, d) => ({ kind: "series", adapter: new Mod16a2gfAdapter(e, d) }),
  ornl_modis_mcd12q2: (e, d) => ({ kind: "phenology", adapter: new Mcd12q2Adapter(e, d) }),
  cmr: (e, d) => ({ kind: "catalog", adapter: new CmrAdapter(e, d) }),
  soilgrids: (e, d) => ({ kind: "soil", adapter: new SoilGridsAdapter(e, d) }),
};

export interface AdapterRegistry {
  manifest: Manifest;
  /** Server sources (IMERG, SMAP, HLS ...): metadata only, so the client can show provenance and gaps. */
  serverSources: SourceEntry[];
  get(id: string): AnyAdapter | undefined;
  /** Series adapters for a canonical variable, in browser priority order. */
  seriesFor(variable: string): BrowserAdapter[];
  /** Server source entries that feed a canonical variable, in priority order. */
  serverSourcesFor(variable: string): SourceEntry[];
}

/** Builds an adapter for every browser source in the manifest. Throws if a source has no adapter class. */
export function buildRegistry(manifest: Manifest, deps: AdapterDeps): AdapterRegistry {
  const adapters = new Map<string, AnyAdapter>();
  for (const entry of manifest.sources) {
    if (entry.runtime !== "browser") continue;
    const factory = FACTORIES[entry.id];
    if (!factory) throw new Error(`No adapter class registered for browser source "${entry.id}"`);
    const built = factory(entry, deps);
    if (built.kind !== entry.kind) {
      const expected: SourceKind = built.kind;
      throw new Error(
        `Source "${entry.id}" is kind "${entry.kind}" but its adapter is "${expected}"`,
      );
    }
    adapters.set(entry.id, built);
  }
  const serverSources = manifest.sources.filter((s) => s.runtime === "server");
  return {
    manifest,
    serverSources,
    get: (id) => adapters.get(id),
    seriesFor: (variable) =>
      (manifest.browser_priority[variable] ?? []).flatMap((id) => {
        const found = adapters.get(id);
        return found?.kind === "series" ? [found.adapter] : [];
      }),
    serverSourcesFor: (variable) =>
      (manifest.priority[variable] ?? []).flatMap((id) => serverSources.filter((s) => s.id === id)),
  };
}

/** Parses the text of data-sources.yaml and builds the registry. */
export function loadRegistry(yamlText: string, deps: AdapterDeps): AdapterRegistry {
  return buildRegistry(parseManifest(yamlText), deps);
}
