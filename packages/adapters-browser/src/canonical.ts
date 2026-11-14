import type { CanonicalVar } from "./types";

export const CANONICAL_VARS = [
  "tmax",
  "tmin",
  "tmean",
  "rh",
  "wind2m",
  "srad",
  "precip",
  "et_actual",
  "sm_surface",
  "sm_rootzone",
  "ndvi",
  "elevation",
  "slope",
] as const satisfies readonly CanonicalVar[];

export const CANONICAL_UNITS: Record<CanonicalVar, string> = {
  tmax: "degC",
  tmin: "degC",
  tmean: "degC",
  rh: "%",
  wind2m: "m/s",
  srad: "MJ/m2/day",
  precip: "mm/day",
  et_actual: "mm/day",
  sm_surface: "m3/m3",
  sm_rootzone: "m3/m3",
  ndvi: "unitless",
  elevation: "m",
  slope: "deg",
};

/** Keys of the bundle `soil` object produced by the SoilGrids adapter. */
export const SOIL_VARS = [
  "clay_pct",
  "sand_pct",
  "silt_pct",
  "soc_pct",
  "ph",
  "awc_mm_per_m",
] as const;
export type SoilVar = (typeof SOIL_VARS)[number];

/** Season dates returned by the MCD12Q2 phenology adapter. */
export const PHENOLOGY_VARS = ["greenup", "peak", "dormancy"] as const;
export type PhenologyVar = (typeof PHENOLOGY_VARS)[number];
