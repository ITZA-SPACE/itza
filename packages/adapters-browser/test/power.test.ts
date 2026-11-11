import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@itza/engine/contracts";
import { describe, expect, it, vi } from "vitest";
import { PowerClimatologyAdapter, PowerDailyAdapter } from "../src/adapters/power";
import { HttpClient } from "../src/http";
import { parseManifest } from "../src/manifest";
import type { CanonicalVar, FetchRequest } from "../src/types";

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
const ALL: CanonicalVar[] = [
  "tmax",
  "tmin",
  "tmean",
  "rh",
  "wind2m",
  "srad",
  "precip",
  "et_actual",
  "sm_rootzone",
];
const req: FetchRequest = {
  lat: 36.19,
  lon: 5.41,
  period: { start: "2023-01-01", end: "2023-01-05" },
  variables: ALL,
};

function daily(fetchImpl: typeof fetch, retries = 0) {
  const http = new HttpClient({ fetch: fetchImpl, sleep: async () => {}, retries });
  return new PowerDailyAdapter(entry("nasa_power_daily"), { http, now });
}

describe("PowerDailyAdapter", () => {
  it("turns the recorded response into schema-valid canonical series", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("power_daily_setif_2023.json")));
    const result = await daily(fetchImpl).fetch(req);
    expect(result.series.map((s) => s.var)).toEqual(ALL);
    for (const series of result.series) {
      const check = validate("canonical-series", series);
      expect(check.ok, JSON.stringify(check)).toBe(true);
      expect(series.provenance).toMatchObject({
        source: "nasa_power_daily",
        product: "POWER Daily API",
        version: "v2.10.3",
        resolution_m: 55000,
        period: req.period,
        retrieved: "2026-11-10",
      });
      expect(series.values).toHaveLength(5);
    }
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain("power.larc.nasa.gov/api/temporal/daily/point");
    expect(url).toContain(
      "parameters=T2M_MAX,T2M_MIN,T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR,EVPTRNS,GWETROOT",
    );
    expect(url).toContain("start=20230101&end=20230105");
  });

  it("maps the -999 fill value to a missing step and reports it", async () => {
    const result = await daily(async () => json(fixture("power_daily_setif_2023.json"))).fetch(req);
    const tmax = result.series.find((s) => s.var === "tmax");
    expect(tmax?.values).toEqual([12.3, 13.1, null, 14.0, 12.8]);
    expect(tmax?.quality).toEqual([0, 0, 2, 0, 0]);
    expect(tmax?.provenance.quality).toBe("medium");
    expect(result.gaps).toContainEqual({
      var: "tmax",
      reason: "1 of 5 days missing",
      severity: "info",
    });
  });

  it("converts proxies to canonical units and labels them", async () => {
    const result = await daily(async () => json(fixture("power_daily_setif_2023.json"))).fetch(req);
    const et = result.series.find((s) => s.var === "et_actual");
    expect(et?.unit).toBe("mm/day");
    expect(et?.values[0]).toBeCloseTo(2.9 / 2.45, 6);
    expect(et?.provenance).toMatchObject({ method: "latent_heat_conversion", quality: "medium" });
    const wet = result.series.find((s) => s.var === "sm_rootzone");
    expect(wet?.unit).toBe("fraction");
    expect(wet?.provenance).toMatchObject({
      method: "wetness_index_not_volumetric",
      quality: "low",
    });
  });

  it("converts kW-hr radiation to MJ", async () => {
    const body = fixture("power_daily_setif_2023.json");
    body.parameters.ALLSKY_SFC_SW_DWN.units = "kW-hr/m^2/day";
    const result = await daily(async () => json(body)).fetch({ ...req, variables: ["srad"] });
    expect(result.series[0]?.values[0]).toBeCloseTo(8.9 * 3.6, 6);
  });

  it("reports unexpected units and absent parameters as gaps", async () => {
    const body = fixture("power_daily_setif_2023.json");
    body.parameters.RH2M.units = "fraction";
    body.properties.parameter.WS2M = undefined;
    const result = await daily(async () => json(body)).fetch({
      ...req,
      variables: ["rh", "wind2m", "precip"],
    });
    expect(result.series.map((s) => s.var)).toEqual(["precip"]);
    expect(result.gaps.map((g) => g.reason)).toEqual([
      "POWER Daily API returned unexpected units for RH2M",
      "POWER Daily API did not return WS2M",
    ]);
  });

  it("returns a gap when every day is missing", async () => {
    const body = fixture("power_daily_setif_2023.json");
    body.properties.parameter.T2M = Object.fromEntries(
      Object.keys(body.properties.parameter.T2M).map((k) => [k, -999]),
    );
    const result = await daily(async () => json(body)).fetch({ ...req, variables: ["tmean"] });
    expect(result.series).toEqual([]);
    expect(result.gaps[0]?.reason).toBe("POWER Daily API has no data for this period");
  });

  it("returns one gap per variable on HTTP failure, without throwing", async () => {
    const result = await daily(async () => json({}, 503), 1).fetch(req);
    expect(result.series).toEqual([]);
    expect(result.gaps).toHaveLength(ALL.length);
    expect(result.gaps[0]).toEqual({
      var: "tmax",
      reason: "POWER Daily API unavailable: HTTP 503 after 2 attempts",
      severity: "warning",
    });
  });

  it("returns gaps for an unexpected response shape", async () => {
    const result = await daily(async () => json({ hello: "world" })).fetch({
      ...req,
      variables: ["precip"],
    });
    expect(result.gaps[0]?.reason).toBe("POWER Daily API returned an unexpected response");
  });

  it("ignores variables it does not provide", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await daily(fetchImpl).fetch({ ...req, variables: ["ndvi", "elevation"] });
    expect(result).toEqual({ series: [], gaps: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("describes itself from the manifest", () => {
    const caps = daily(vi.fn<typeof fetch>()).capabilities();
    expect(caps).toMatchObject({ resolution_m: 55000, auth: "none" });
    expect(caps.variables).toContain("sm_rootzone");
  });
});

describe("PowerClimatologyAdapter", () => {
  const adapter = (fetchImpl: typeof fetch) =>
    new PowerClimatologyAdapter(entry("nasa_power_climatology"), {
      http: new HttpClient({ fetch: fetchImpl, sleep: async () => {}, retries: 0 }),
      now,
    });

  it("returns twelve monthly normals with provenance", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("power_climatology_setif.json")));
    const result = await adapter(fetchImpl).fetch({ ...req, variables: ["tmean", "precip"] });
    expect(result.gaps).toEqual([]);
    for (const series of result.series) {
      expect(validate("canonical-series", series).ok).toBe(true);
      expect(series.cadence).toBe("monthly");
      expect(series.values).toHaveLength(12);
      expect(series.provenance.period).toEqual({ start: "2001-01-01", end: "2025-12-31" });
    }
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/api/temporal/climatology/point");
  });

  it("returns a gap when normals are missing and when the request fails", async () => {
    const body = fixture("power_climatology_setif.json");
    body.properties.parameter.T2M = Object.fromEntries(
      Object.keys(body.properties.parameter.T2M).map((k) => [k, -999]),
    );
    const missing = await adapter(async () => json(body)).fetch({ ...req, variables: ["tmean"] });
    expect(missing.gaps[0]?.reason).toBe("POWER Climatology API has no normals here");
    const failed = await adapter(async () => json({}, 500)).fetch({ ...req, variables: ["tmean"] });
    expect(failed.gaps[0]?.reason).toContain("HTTP 500");
  });
});

describe("POWER responses with missing metadata", () => {
  it("falls back to the manifest version and default fill value when the header is absent", async () => {
    const body = fixture("power_daily_setif_2023.json");
    body.header = undefined;
    body.properties.parameter.T2M_MIN.fill = undefined;
    const result = await daily(async () => json(body)).fetch({ ...req, variables: ["tmin"] });
    expect(result.series[0]?.provenance.version).toBe("v2.10");
    expect(result.series[0]?.values).toHaveLength(5);
  });

  it("reports missing unit information as a gap", async () => {
    const body = fixture("power_daily_setif_2023.json");
    body.parameters = undefined;
    const result = await daily(async () => json(body)).fetch({ ...req, variables: ["tmax"] });
    expect(result.gaps[0]?.reason).toBe("POWER Daily API returned unexpected units for T2M_MAX");
    const odd = fixture("power_daily_setif_2023.json");
    odd.parameters.T2M_MAX = "C";
    const second = await daily(async () => json(odd)).fetch({ ...req, variables: ["tmax"] });
    expect(second.gaps).toHaveLength(1);
  });

  it("uses default normals years when the climatology header omits them", async () => {
    const body = fixture("power_climatology_setif.json");
    body.header = {};
    const adapter = new PowerClimatologyAdapter(entry("nasa_power_climatology"), {
      http: new HttpClient({ fetch: async () => json(body), sleep: async () => {}, retries: 0 }),
      now,
    });
    const result = await adapter.fetch({ ...req, variables: ["precip"] });
    expect(result.series[0]?.provenance.period).toEqual({ start: "2001-01-01", end: "2025-12-31" });
    expect(result.series[0]?.provenance.version).toBe("v2.10");
  });
});
