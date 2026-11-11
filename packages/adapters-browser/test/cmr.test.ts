import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CmrAdapter } from "../src/adapters/cmr";
import { HttpClient } from "../src/http";
import { parseManifest } from "../src/manifest";

const root = resolve(__dirname, "../../..");
const manifest = parseManifest(readFileSync(resolve(root, "data-sources.yaml"), "utf8"));
const entry = manifest.sources.find((s) => s.id === "cmr");
if (!entry) throw new Error("cmr entry missing");
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(root, "fixtures/adapters", name), "utf8"));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const adapter = (fetchImpl: typeof fetch) =>
  new CmrAdapter(entry, {
    http: new HttpClient({ fetch: fetchImpl, sleep: async () => {}, retries: 0 }),
  });
const query = {
  shortName: "HLSS30_VI",
  lat: 36.19,
  lon: 5.41,
  period: { start: "2026-03-01", end: "2026-03-31" },
};

describe("CmrAdapter.collection", () => {
  it("reads the collection record", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("cmr_collection_spl4smgp.json")));
    const result = await adapter(fetchImpl).collection("SPL4SMGP");
    expect(result).toEqual({
      value: {
        id: "C2531308461-NSIDC_ECS",
        shortName: "SPL4SMGP",
        version: "008",
        title: expect.stringContaining("SMAP L4"),
        timeStart: "2015-03-31T01:30:00.000Z",
        timeEnd: "2026-11-05T22:30:00.000Z",
      },
      gaps: [],
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://cmr.earthdata.nasa.gov/search/collections.json?short_name=SPL4SMGP&page_size=1",
    );
  });

  it("reports an unknown collection and a failing service as gaps", async () => {
    const none = await adapter(async () => json({ feed: { entry: [] } })).collection("NOPE");
    expect(none).toEqual({
      gaps: [{ var: "NOPE", reason: "CMR has no collection named NOPE", severity: "warning" }],
    });
    const down = await adapter(async () => json({}, 500)).collection("SPL4SMGP");
    expect(down.gaps[0]?.reason).toBe("CMR unavailable: HTTP 500 after 1 attempts");
    expect(down.value).toBeUndefined();
  });
});

describe("CmrAdapter.granules", () => {
  it("reports the hit count and the latest granule", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("cmr_granules_hlss30_vi.json"), 200, { "CMR-Hits": "7" }));
    const result = await adapter(fetchImpl).granules(query);
    expect(result).toEqual({
      value: {
        shortName: "HLSS30_VI",
        hits: 7,
        latest: {
          id: "G3178123456-LPCLOUD",
          title: "HLS.S30.T31SGA.2026074T103021.v2.0",
          timeStart: "2026-03-15T10:30:21.000Z",
        },
      },
      gaps: [],
    });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("short_name=HLSS30_VI&point=5.41,36.19");
    expect(url).toContain("temporal=2026-03-01T00:00:00Z,2026-03-31T23:59:59Z");
  });

  it("falls back to the page size when CMR sends no hit count", async () => {
    const result = await adapter(async () => json(fixture("cmr_granules_hlss30_vi.json"))).granules(
      query,
    );
    expect(result.value?.hits).toBe(1);
  });

  it("turns zero granules into a gap named for the variable", async () => {
    const result = await adapter(async () =>
      json(fixture("cmr_granules_empty.json"), 200, { "CMR-Hits": "0" }),
    ).granules({ ...query, shortName: "NISAR_L3_SME2_PROVISIONAL_V1", variable: "sm_surface" });
    expect(result.value).toEqual({
      shortName: "NISAR_L3_SME2_PROVISIONAL_V1",
      hits: 0,
      latest: null,
    });
    expect(result.gaps).toEqual([
      {
        var: "sm_surface",
        reason: "No NISAR_L3_SME2_PROVISIONAL_V1 granules cover this point in this period",
        severity: "warning",
      },
    ]);
  });

  it("returns gaps for failures and unexpected responses", async () => {
    const down = await adapter(async () => json({}, 503)).granules(query);
    expect(down.gaps[0]?.reason).toContain("CMR unavailable: HTTP 503");
    const odd = await adapter(async () => json({ nope: true })).granules(query);
    expect(odd.gaps[0]?.reason).toBe("CMR returned an unexpected response");
  });

  it("describes itself from the manifest", () => {
    expect(adapter(vi.fn<typeof fetch>()).capabilities()).toMatchObject({
      variables: [],
      auth: "none",
    });
  });
});
