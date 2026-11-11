import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpClient } from "../src/http";
import { type Manifest, parseManifest } from "../src/manifest";
import { buildRegistry, loadRegistry } from "../src/registry";

const text = readFileSync(resolve(__dirname, "../../../data-sources.yaml"), "utf8");
const deps = { http: new HttpClient({ fetch: async () => new Response("{}"), retries: 0 }) };

describe("adapter registry", () => {
  const registry = loadRegistry(text, deps);

  it("builds an adapter for every browser source", () => {
    const browserIds = registry.manifest.sources
      .filter((s) => s.runtime === "browser")
      .map((s) => s.id);
    expect(browserIds).toHaveLength(7);
    for (const id of browserIds) expect(registry.get(id)?.adapter.id).toBe(id);
    expect(registry.get("nasa_power_daily")?.kind).toBe("series");
    expect(registry.get("ornl_modis_mcd12q2")?.kind).toBe("phenology");
    expect(registry.get("soilgrids")?.kind).toBe("soil");
    expect(registry.get("cmr")?.kind).toBe("catalog");
    expect(registry.get("smap_l4")).toBeUndefined();
  });

  it("exposes server sources as metadata only", () => {
    expect(registry.serverSources.map((s) => s.id)).toEqual([
      "gpm_imerg_final_daily",
      "gpm_imerg_late_daily",
      "smap_l4",
      "hls_vi",
    ]);
    expect(registry.serverSourcesFor("precip").map((s) => s.id)).toEqual([
      "gpm_imerg_final_daily",
      "gpm_imerg_late_daily",
    ]);
    expect(registry.serverSourcesFor("tmax")).toEqual([]);
  });

  it("lists series adapters for a variable in browser priority order", () => {
    expect(registry.seriesFor("et_actual").map((a) => a.id)).toEqual([
      "ornl_modis_mod16a2gf",
      "nasa_power_daily",
    ]);
    expect(registry.seriesFor("ndvi").map((a) => a.id)).toEqual(["ornl_modis_mod13q1"]);
    expect(registry.seriesFor("elevation")).toEqual([]);
  });

  it("fails at build time for a browser source without an adapter class", () => {
    const manifest: Manifest = parseManifest(text);
    const template = manifest.sources.find((s) => s.id === "nasa_power_daily");
    if (!template) throw new Error("nasa_power_daily missing");
    const extra = { ...template, id: "mystery_source" };
    expect(() =>
      buildRegistry({ ...manifest, sources: [...manifest.sources, extra] }, deps),
    ).toThrow('No adapter class registered for browser source "mystery_source"');
  });

  it("fails when the manifest kind disagrees with the adapter kind", () => {
    const manifest = parseManifest(text);
    const sources = manifest.sources.map((s) =>
      s.id === "cmr" ? { ...s, kind: "soil" as const } : s,
    );
    expect(() => buildRegistry({ ...manifest, sources }, deps)).toThrow(
      /kind "soil" but its adapter/,
    );
  });

  it("rejects an invalid manifest", () => {
    expect(() => loadRegistry("sources: nope", deps)).toThrow(/Invalid data-sources.yaml/);
  });
});
