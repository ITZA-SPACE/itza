import type { CanonicalSeries } from "@itza/engine/contracts";
import { expect, it } from "vitest";
import { mergeSeries } from "./merge";

const model: CanonicalSeries = {
  var: "sm_rootzone",
  unit: "m3/m3",
  cadence: "daily",
  start: "2014-06-01",
  values: [0.1, 0.2],
  quality: [0, 1],
  segments: [
    { start: "2014-06-01", source: "smap_l4" },
    { start: "2014-06-02", source: "gldas_noah" },
  ],
  provenance: {
    source: "smap_l4",
    product: "SPL4SMGP",
    version: "8",
    resolution_m: 27830,
    period: { start: "2014-06-01", end: "2014-06-02" },
    quality: "low",
    method: "modeled fallback",
    retrieved: "2026-11-14",
  },
};

it("retains modeled source switches when server chunks are merged", () => {
  const chunk = {
    ...model,
    start: "2014-06-03",
    values: [0.3],
    quality: [1],
    segments: [],
    provenance: { ...model.provenance, source: "nldas_noah" },
  };
  const result = mergeSeries([model, chunk], { sm_rootzone: ["smap_l4", "nldas_noah"] }).series[0];
  expect(result?.values).toEqual([0.1, 0.2, 0.3]);
  expect(result?.quality).toEqual([0, 1, 1]);
  expect(result?.segments?.map((s) => s.source)).toEqual(["smap_l4", "gldas_noah", "nldas_noah"]);
  expect(result?.provenance.quality).toBe("low");
  expect(result?.provenance.method).toContain("modeled");
});

it("keeps POWER wetness fractions separate from volumetric moisture", () => {
  const wetness = {
    ...model,
    unit: "fraction",
    values: [0.9, 0.9],
    provenance: { ...model.provenance, source: "nasa_power_daily" },
  };
  const result = mergeSeries([wetness, model], { sm_rootzone: ["smap_l4", "nasa_power_daily"] });
  expect(result.series[0]?.values).toEqual([0.1, 0.2]);
  expect(result.series[0]?.unit).toBe("m3/m3");
  expect(result.gaps[0]?.reason).toContain("incompatible units");
});
