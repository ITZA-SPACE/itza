import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest, sourcesFor, validateManifest } from "../src/manifest";

const text = readFileSync(resolve(__dirname, "../../../data-sources.yaml"), "utf8");

function sourceOf(overrides: Record<string, unknown> = {}) {
  return {
    id: "x",
    provider: "p",
    product: "prod",
    version: "1",
    runtime: "browser",
    auth: "none",
    endpoint: "https://example.test",
    variables: { precip: { source_var: "P", unit: "mm/day" } },
    resolution_m: 100,
    coverage: { start: "2000-01-01", end: "near_real_time" },
    ...overrides,
  };
}

describe("data-sources.yaml", () => {
  it("parses and validates the real manifest", () => {
    const manifest = parseManifest(text);
    const ids = manifest.sources.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "gpm_imerg_final_daily",
        "smap_l4",
        "hls_vi",
        "nasa_power_daily",
        "nasa_power_climatology",
        "ornl_modis_mod13q1",
        "ornl_modis_mod16a2gf",
        "ornl_modis_mcd12q2",
        "cmr",
        "soilgrids",
      ]),
    );
    expect(manifest.sources.find((s) => s.id === "smap_l4")?.kind).toBe("series");
  });

  it("ranks server sources before browser sources", () => {
    const manifest = parseManifest(text);
    expect(sourcesFor(manifest, "precip").map((s) => s.id)).toEqual([
      "gpm_imerg_final_daily",
      "gpm_imerg_late_daily",
      "nasa_power_daily",
    ]);
    expect(sourcesFor(manifest, "ndvi").map((s) => s.id)).toEqual(["hls_vi", "ornl_modis_mod13q1"]);
    expect(sourcesFor(manifest, "et_actual").map((s) => s.id)).toEqual([
      "nldas_noah",
      "gldas_noah",
      "ornl_modis_mod16a2gf",
      "nasa_power_daily",
    ]);
    expect(sourcesFor(manifest, "elevation")).toEqual([]);
  });

  it("does not repeat a source listed in both chains", () => {
    const result = validateManifest({
      sources: [sourceOf({ id: "a" })],
      priority: { precip: ["a"] },
      browser_priority: { precip: ["a"] },
    });
    if (!result.ok) throw new Error(result.errors.join());
    expect(sourcesFor(result.manifest, "precip").map((s) => s.id)).toEqual(["a"]);
  });
});

describe("validateManifest", () => {
  const fails = (raw: unknown, message: string) => {
    const result = validateManifest(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain(message);
  };

  it("accepts a minimal valid manifest", () => {
    expect(validateManifest({ sources: [sourceOf()] }).ok).toBe(true);
  });

  it("rejects unknown canonical variables", () => {
    fails(
      { sources: [sourceOf({ variables: { rainfall: { source_var: "P", unit: "mm" } } })] },
      "unknown series variable",
    );
  });

  it("rejects unknown soil and phenology variables and catalog variables", () => {
    fails(
      {
        sources: [
          sourceOf({ kind: "soil", variables: { gravel: { source_var: "g", unit: "%" } } }),
        ],
      },
      "unknown soil variable",
    );
    fails(
      {
        sources: [
          sourceOf({ kind: "phenology", variables: { bloom: { source_var: "b", unit: "date" } } }),
        ],
      },
      "unknown phenology variable",
    );
    fails(
      {
        sources: [
          sourceOf({
            kind: "catalog",
            resolution_m: 0,
            variables: { precip: { source_var: "P", unit: "mm" } },
          }),
        ],
      },
      "catalog sources cannot declare variables",
    );
  });

  it("rejects missing or malformed fields", () => {
    fails({ sources: [sourceOf({ product: undefined })] }, "product is required");
    fails({ sources: [sourceOf({ runtime: "edge" })] }, "runtime must be");
    fails({ sources: [sourceOf({ auth: "basic" })] }, "auth must be");
    fails({ sources: [sourceOf({ kind: "raster" })] }, "kind must be one of");
    fails({ sources: [sourceOf({ endpoint: undefined })] }, "endpoint is required");
    fails({ sources: [sourceOf({ resolution_m: -1 })] }, "resolution_m must be positive");
    fails({ sources: [sourceOf({ coverage: { start: "2000", end: "now" } })] }, "coverage.start");
    fails({ sources: [sourceOf({ coverage: "always" })] }, "coverage must be an object");
    fails({ sources: [sourceOf({ variables: "none" })] }, "variables must be an object");
    fails({ sources: [sourceOf({ variables: { precip: { unit: "mm" } } })] }, "needs source_var");
    fails({ sources: ["nope"] }, "must be an object");
    fails({}, "sources list");
  });

  it("rejects duplicate ids and bad priority lists", () => {
    fails({ sources: [sourceOf(), sourceOf()] }, "duplicate source id");
    fails({ sources: [sourceOf()], priority: { rain: ["x"] } }, "unknown canonical variable");
    fails({ sources: [sourceOf()], priority: { precip: ["y"] } }, "unknown source y");
    fails({ sources: [sourceOf()], priority: { tmax: ["x"] } }, "does not provide tmax");
    fails({ sources: [sourceOf()], priority: { precip: "x" } }, "must be a list");
    fails({ sources: [sourceOf()], priority: [] }, "priority must be an object");
    fails(
      { sources: [sourceOf()], browser_priority: { precip: ["y"] } },
      "browser_priority.precip",
    );
  });

  it("throws a readable error from parseManifest", () => {
    expect(() => parseManifest("sources: []\npriority: { rain: [] }")).toThrow(/unknown canonical/);
  });
});
