import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@itza/engine/contracts";
import { describe, expect, it, vi } from "vitest";
import { Mcd12q2Adapter, Mod13q1Adapter, Mod16a2gfAdapter } from "../src/adapters/ornl-modis";
import { HttpClient } from "../src/http";
import { parseManifest } from "../src/manifest";
import type { FetchRequest } from "../src/types";

const root = resolve(__dirname, "../../..");
const manifest = parseManifest(readFileSync(resolve(root, "data-sources.yaml"), "utf8"));
const entry = (id: string) => {
  const found = manifest.sources.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(root, "fixtures/adapters", name), "utf8"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const now = () => new Date("2026-11-10T12:00:00Z");

/** Routes a request URL to a recorded fixture by endpoint and band. */
function router(routes: Record<string, unknown>, fail: (url: string) => boolean = () => false) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (fail(url)) return json({}, 503);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? json(routes[key]) : json({}, 404);
  });
}
const http = (fetchImpl: typeof fetch) =>
  new HttpClient({ fetch: fetchImpl, sleep: async () => {}, retries: 0 });

const base: Omit<FetchRequest, "variables"> = {
  lat: 36.19,
  lon: 5.41,
  period: { start: "2023-01-01", end: "2023-02-28" },
};

const ndviRoutes = () => ({
  "MOD13Q1/dates": fixture("ornl_mod13q1_dates.json"),
  "band=250m_16_days_NDVI": fixture("ornl_mod13q1_ndvi.json"),
  "band=250m_16_days_VI_Quality": fixture("ornl_mod13q1_quality.json"),
});

describe("Mod13q1Adapter", () => {
  const adapter = (fetchImpl: typeof fetch) =>
    new Mod13q1Adapter(entry("ornl_modis_mod13q1"), { http: http(fetchImpl), now });
  const req: FetchRequest = { ...base, variables: ["ndvi"] };

  it("scales NDVI, masks fill and cloudy pixels, and is schema-valid", async () => {
    const fetchImpl = router(ndviRoutes());
    const result = await adapter(fetchImpl).fetch(req);
    const series = result.series[0];
    expect(series?.values).toEqual([0.2412, 0.2655, null, null]);
    expect(series?.quality).toEqual([0, 0, 2, 2]);
    expect(series).toMatchObject({
      var: "ndvi",
      cadence: "16day",
      start: "2023-01-01",
      provenance: {
        source: "ornl_modis_mod13q1",
        product: "MOD13Q1",
        version: "061",
        resolution_m: 250,
        retrieved: "2026-11-10",
      },
    });
    expect(validate("canonical-series", series).ok).toBe(true);
    expect(result.gaps).toEqual([
      { var: "ndvi", reason: "2 of 4 composites masked as cloudy or missing", severity: "info" },
    ]);
    const subset = fetchImpl.mock.calls.map(([u]) => String(u)).find((u) => u.includes("NDVI"));
    expect(subset).toContain("startDate=A2023001&endDate=A2023049");
  });

  it("only uses composites inside the period", async () => {
    const result = await adapter(router(ndviRoutes())).fetch({
      ...req,
      period: { start: "2023-01-10", end: "2023-02-05" },
    });
    expect(result.series[0]?.start).toBe("2023-01-17");
    expect(result.series[0]?.values).toHaveLength(2);
  });

  it("gaps when the date list cannot be fetched", async () => {
    const result = await adapter(router({}, () => true)).fetch(req);
    expect(result).toEqual({
      series: [],
      gaps: [
        {
          var: "ndvi",
          reason: "MOD13Q1 unavailable: HTTP 503 after 1 attempts",
          severity: "warning",
        },
      ],
    });
  });

  it("gaps on a malformed date list and when no composite falls in the period", async () => {
    const bad = await adapter(router({ "MOD13Q1/dates": { nope: 1 } })).fetch(req);
    expect(bad.gaps[0]?.reason).toBe("MOD13Q1 unavailable: unexpected date list");
    const empty = await adapter(router(ndviRoutes())).fetch({
      ...req,
      period: { start: "2030-01-01", end: "2030-12-31" },
    });
    expect(empty.gaps[0]?.reason).toBe("MOD13Q1 has no composites in this period");
  });

  it("treats a failed band request as missing composites", async () => {
    const result = await adapter(router(ndviRoutes(), (u) => u.includes("VI_Quality"))).fetch(req);
    expect(result.series).toEqual([]);
    expect(result.gaps.map((g) => g.reason)).toEqual([
      "MOD13Q1: 1 of 1 requests failed (HTTP 503 after 1 attempts)",
      "MOD13Q1 has no usable NDVI in this period",
    ]);
  });

  it("reports an unexpected subset response", async () => {
    const result = await adapter(
      router({ ...ndviRoutes(), "band=250m_16_days_NDVI": { subset: "x" } }),
    ).fetch(req);
    expect(result.gaps[0]?.reason).toContain("unexpected subset response");
  });

  it("requests long ranges in chunks of ten composites", async () => {
    const dates = Array.from({ length: 25 }, (_, i) => {
      const iso = new Date(Date.UTC(2023, 0, 1 + i * 16)).toISOString().slice(0, 10);
      const doy = String(1 + i * 16).padStart(3, "0");
      return { modis_date: `A2023${doy}`, calendar_date: iso };
    });
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/dates")) return json({ dates });
      const quality = url.includes("VI_Quality");
      return json({
        scale: quality ? "1" : "0.0001",
        subset: dates.map((d) => ({
          calendar_date: d.calendar_date,
          data: [quality ? 2048 : 5000],
        })),
      });
    });
    const result = await adapter(fetchImpl).fetch({
      ...req,
      period: { start: "2023-01-01", end: "2023-12-31" },
    });
    expect(result.series[0]?.values.every((v) => v === 0.5)).toBe(true);
    const subsets = fetchImpl.mock.calls.filter(([u]) => String(u).includes("/subset"));
    expect(subsets).toHaveLength(6);
  });

  it("ignores requests without ndvi and reports capabilities", async () => {
    const fetchImpl = router({});
    const a = adapter(fetchImpl);
    expect(await a.fetch({ ...req, variables: ["tmax"] })).toEqual({ series: [], gaps: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(a.capabilities()).toMatchObject({ resolution_m: 250, variables: ["ndvi"] });
  });
});

describe("Mod16a2gfAdapter", () => {
  const adapter = (fetchImpl: typeof fetch) =>
    new Mod16a2gfAdapter(entry("ornl_modis_mod16a2gf"), { http: http(fetchImpl), now });
  const routes = () => ({
    "MOD16A2GF/dates": fixture("ornl_mod16a2gf_dates.json"),
    "band=ET_500m": fixture("ornl_mod16a2gf_et.json"),
  });
  const req: FetchRequest = {
    ...base,
    period: { start: "2023-01-01", end: "2023-01-24" },
    variables: ["et_actual"],
  };

  it("expands 8-day composites to a daily mm/day rate and marks fill values missing", async () => {
    const result = await adapter(router(routes())).fetch(req);
    const series = result.series[0];
    expect(series?.cadence).toBe("daily");
    expect(series?.unit).toBe("mm/day");
    expect(series?.values).toHaveLength(24);
    // 48 raw x 0.1 kg/m2 per 8 days = 0.6 mm/day; 64 raw = 0.8 mm/day; the middle composite is fill.
    expect(series?.values.slice(0, 8).every((v) => v === 0.6)).toBe(true);
    expect(series?.values.slice(8, 16).every((v) => v === null)).toBe(true);
    expect(series?.values.slice(16).every((v) => v === 0.8)).toBe(true);
    expect(series?.provenance).toMatchObject({
      source: "ornl_modis_mod16a2gf",
      resolution_m: 500,
      method: "8day_composite_daily_rate",
    });
    expect(validate("canonical-series", series).ok).toBe(true);
    expect(result.gaps).toEqual([
      { var: "et_actual", reason: "8 of 24 days without ET", severity: "info" },
    ]);
  });

  it("shortens the last composite of a year", async () => {
    const dates = [
      { modis_date: "A2022361", calendar_date: "2022-12-27" },
      { modis_date: "A2023001", calendar_date: "2023-01-01" },
    ];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/dates")) return json({ dates });
      return json({
        scale: "0.1",
        subset: dates.map((d) => ({ calendar_date: d.calendar_date, data: [80] })),
      });
    });
    const result = await adapter(fetchImpl).fetch({
      ...req,
      period: { start: "2022-12-25", end: "2023-01-03" },
    });
    const values = result.series[0]?.values ?? [];
    expect(values.slice(0, 2)).toEqual([null, null]);
    expect(values.slice(2).every((v) => v === 1)).toBe(true);
    expect(values).toHaveLength(10);
  });

  it("returns gaps for failures, empty periods and all-fill data", async () => {
    expect((await adapter(router({}, () => true)).fetch(req)).gaps[0]?.reason).toBe(
      "MOD16A2GF unavailable: HTTP 503 after 1 attempts",
    );
    const none = await adapter(router(routes())).fetch({
      ...req,
      period: { start: "2031-01-01", end: "2031-01-31" },
    });
    expect(none.gaps[0]?.reason).toBe("MOD16A2GF has no composites in this period");
    const allFill = fixture("ornl_mod16a2gf_et.json");
    for (const item of allFill.subset) item.data = [32767];
    const filled = await adapter(router({ ...routes(), "band=ET_500m": allFill })).fetch(req);
    expect(filled.series).toEqual([]);
    expect(filled.gaps.at(-1)?.reason).toBe("MOD16A2GF has no usable ET in this period");
    const partial = await adapter(router(routes(), (u) => u.includes("band=ET_500m"))).fetch(req);
    expect(partial.gaps[0]?.reason).toBe(
      "MOD16A2GF: 1 of 1 requests failed (HTTP 503 after 1 attempts)",
    );
  });

  it("ignores requests without et_actual", async () => {
    expect(await adapter(router({})).fetch({ ...req, variables: ["ndvi"] })).toEqual({
      series: [],
      gaps: [],
    });
  });
});

describe("Mcd12q2Adapter", () => {
  const adapter = (fetchImpl: typeof fetch) =>
    new Mcd12q2Adapter(entry("ornl_modis_mcd12q2"), { http: http(fetchImpl), now });
  const routes = () => ({
    "MCD12Q2/dates": fixture("ornl_mcd12q2_dates.json"),
    "band=Greenup": fixture("ornl_mcd12q2_greenup.json"),
    "band=Peak": fixture("ornl_mcd12q2_peak.json"),
    "band=Dormancy": fixture("ornl_mcd12q2_dormancy.json"),
  });
  const req: FetchRequest = {
    ...base,
    period: { start: "2021-01-01", end: "2022-12-31" },
    variables: [],
  };

  it("converts day numbers to dates and reports seasons without a green-up", async () => {
    const result = await adapter(router(routes())).fetchPhenology(req);
    expect(result.seasons).toEqual([
      { year: 2021, greenup: "2021-02-15", peak: "2021-04-20", dormancy: "2021-06-10" },
      { year: 2022, greenup: null, peak: "2022-04-19", dormancy: "2022-06-09" },
    ]);
    expect(result.provenance).toMatchObject({
      source: "ornl_modis_mcd12q2",
      resolution_m: 500,
      retrieved: "2026-11-10",
    });
    expect(result.gaps).toEqual([]);
  });

  it("notes years with no detected phenology", async () => {
    const empty = { ...fixture("ornl_mcd12q2_greenup.json") };
    for (const item of empty.subset) item.data = [32767];
    const result = await adapter(
      router({ ...routes(), "band=Greenup": empty, "band=Peak": empty, "band=Dormancy": empty }),
    ).fetchPhenology(req);
    expect(result.seasons).toEqual([]);
    expect(result.gaps.map((g) => g.reason)).toEqual([
      "no phenology detected for 2021",
      "no phenology detected for 2022",
    ]);
  });

  it("returns gaps when the service fails or has no seasons", async () => {
    const down = await adapter(router({}, () => true)).fetchPhenology(req);
    expect(down.gaps[0]?.reason).toBe("MCD12Q2 unavailable: HTTP 503 after 1 attempts");
    const none = await adapter(router(routes())).fetchPhenology({
      ...req,
      period: { start: "2030-01-01", end: "2030-12-31" },
    });
    expect(none.gaps[0]?.reason).toBe("MCD12Q2 has no seasons in this period");
    const failed = await adapter(router(routes(), (u) => u.includes("band=Peak"))).fetchPhenology(
      req,
    );
    expect(failed.seasons).toEqual([]);
    expect(failed.gaps[0]?.reason).toBe(
      "MCD12Q2: 1 of 1 requests failed (HTTP 503 after 1 attempts)",
    );
  });
});
