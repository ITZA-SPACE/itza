import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@itza/engine/contracts";
import { describe, expect, it, vi } from "vitest";
import { GENERIC_SOIL_DEFAULTS, SoilGridsAdapter } from "../src/adapters/soilgrids";
import { HttpClient } from "../src/http";
import { parseManifest } from "../src/manifest";

const root = resolve(__dirname, "../../..");
const manifest = parseManifest(readFileSync(resolve(root, "data-sources.yaml"), "utf8"));
const entry = manifest.sources.find((s) => s.id === "soilgrids");
if (!entry) throw new Error("soilgrids entry missing");
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(root, "fixtures/adapters", name), "utf8"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const adapter = (fetchImpl: typeof fetch, defaults = GENERIC_SOIL_DEFAULTS) =>
  new SoilGridsAdapter(
    entry,
    { http: new HttpClient({ fetch: fetchImpl, sleep: async () => {}, retries: 0 }) },
    defaults,
  );
const point = { lat: 36.05, lon: 5.52 };

describe("SoilGridsAdapter", () => {
  it("weights the root-zone layers and tags every value with its source", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("soilgrids_setif_field.json")));
    const { soil, gaps } = await adapter(fetchImpl).fetchSoil(point);
    expect(gaps).toEqual([]);
    // Thickness weights 5, 10, 15, 30, 40 cm over a 100 cm root zone.
    expect(soil.clay_pct).toEqual({ value: 34.45, source: "soilgrids", confidence: "medium" });
    expect(soil.sand_pct?.value).toBe(25.1);
    expect(soil.silt_pct?.value).toBe(40.45);
    expect(soil.ph).toEqual({ value: 8.09, source: "soilgrids", confidence: "medium" });
    expect(soil.awc_mm_per_m?.value).toBe(141.3);
    // One layer has no organic carbon, so the mean uses the others and confidence drops.
    expect(soil.soc_pct).toEqual({ value: 0.84, source: "soilgrids", confidence: "low" });
    expect(Object.keys(soil).sort()).toEqual(
      ["awc_mm_per_m", "clay_pct", "ph", "sand_pct", "silt_pct", "soc_pct"].sort(),
    );
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("rest.isric.org/soilgrids/v2.0/properties/query?lon=5.52&lat=36.05");
    expect(url).toContain("property=wv0033");
    expect(url).toContain("depth=60-100cm&value=mean");
  });

  it("produces soil values that fit the field bundle", async () => {
    const bundle = JSON.parse(
      readFileSync(resolve(root, "fixtures/synthetic/semi-arid-winter-cereal.bundle.json"), "utf8"),
    );
    const { soil } = await adapter(async () =>
      json(fixture("soilgrids_setif_field.json")),
    ).fetchSoil(point);
    const result = validate("field-bundle", { ...bundle, soil });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("falls back to the regional default, tagged low, when SoilGrids returns nulls", async () => {
    const { soil, gaps } = await adapter(async () =>
      json(fixture("soilgrids_setif_city_null.json")),
    ).fetchSoil({
      lat: 36.19,
      lon: 5.41,
    });
    expect(soil.clay_pct).toEqual({ value: 25, source: "regional_default", confidence: "low" });
    expect(soil.awc_mm_per_m?.value).toBe(140);
    expect(gaps).toHaveLength(6);
    expect(gaps[0]).toEqual({
      var: "clay_pct",
      reason: "SoilGrids has no value for clay_pct here; using regional default",
      severity: "warning",
    });
  });

  it("uses supplied regional defaults", async () => {
    const { soil } = await adapter(async () => json({}, 404), {
      ...GENERIC_SOIL_DEFAULTS,
      clay_pct: 41,
    }).fetchSoil(point);
    expect(soil.clay_pct?.value).toBe(41);
  });

  it("falls back and reports one gap when the service fails", async () => {
    const { soil, gaps } = await adapter(async () => json({}, 502)).fetchSoil(point);
    expect(Object.values(soil).every((v) => v.source === "regional_default")).toBe(true);
    expect(gaps).toEqual([
      {
        var: "soil",
        reason: "SoilGrids unavailable: HTTP 502 after 1 attempts; using regional defaults",
        severity: "warning",
      },
    ]);
  });

  it("falls back on an unexpected response shape", async () => {
    const { soil, gaps } = await adapter(async () => json({ hello: 1 })).fetchSoil(point);
    expect(soil.ph?.confidence).toBe("low");
    expect(gaps[0]?.reason).toBe(
      "SoilGrids returned an unexpected response; using regional defaults",
    );
  });

  it("describes itself from the manifest", () => {
    const caps = adapter(vi.fn<typeof fetch>()).capabilities();
    expect(caps).toMatchObject({ resolution_m: 250, auth: "none" });
    expect(caps.variables).toContain("awc_mm_per_m");
  });
});

describe("SoilGridsAdapter edge cases", () => {
  it("skips malformed layers and depths", async () => {
    const body = fixture("soilgrids_setif_field.json");
    body.properties.layers.unshift("junk", { name: 5, depths: [] });
    body.properties.layers[3].depths.unshift("junk", {
      range: { top_depth: 100, bottom_depth: 100 },
    });
    const { soil } = await adapter(async () => json(body)).fetchSoil(point);
    expect(soil.clay_pct?.source).toBe("soilgrids");
    const noFactor = fixture("soilgrids_setif_field.json");
    for (const layer of noFactor.properties.layers) layer.unit_measure = {};
    const result = await adapter(async () => json(noFactor)).fetchSoil(point);
    expect(result.soil.clay_pct?.source).toBe("regional_default");
  });

  it("falls back for available water when only one water layer is present", async () => {
    const body = fixture("soilgrids_setif_field.json");
    body.properties.layers = body.properties.layers.filter(
      (l: { name: string }) => l.name !== "wv1500",
    );
    const { soil, gaps } = await adapter(async () => json(body)).fetchSoil(point);
    expect(soil.awc_mm_per_m?.source).toBe("regional_default");
    expect(gaps.map((g) => g.var)).toEqual(["awc_mm_per_m"]);
  });

  it("treats a missing water value at one depth as an incomplete profile", async () => {
    const body = fixture("soilgrids_setif_field.json");
    const wv = body.properties.layers.find((l: { name: string }) => l.name === "wv0033");
    wv.depths[4].values.mean = null;
    const { soil } = await adapter(async () => json(body)).fetchSoil(point);
    expect(soil.awc_mm_per_m?.confidence).toBe("low");
  });
});
