import type { Soil } from "../contracts";

export type TextureClass =
  | "sand"
  | "loamy_sand"
  | "sandy_loam"
  | "loam"
  | "silt_loam"
  | "silt"
  | "sandy_clay_loam"
  | "clay_loam"
  | "silty_clay_loam"
  | "sandy_clay"
  | "silty_clay"
  | "clay";

export type HydrologicGroup = "A" | "B" | "C" | "D";

export interface SoilParams {
  texture: TextureClass;
  /** True when clay and sand were missing and a loam was assumed. */
  assumedTexture: boolean;
  /** Plant-available water per metre of soil, mm/m: 1000 (theta_FC - theta_WP). */
  awcMmPerM: number;
  hydrologicGroup: HydrologicGroup;
  /** Readily evaporable and total evaporable water of the top layer, mm (FAO-56 Table 19). */
  rewMm: number;
  tewMm: number;
  /** Deepest the roots can reach, m: the soil depth when known (a soil test), otherwise unlimited. */
  maxRootDepthM: number;
}

/** USDA texture class from clay and sand percent (silt is the rest). */
export function textureClass(clayPct: number, sandPct: number): TextureClass {
  const clay = clayPct;
  const sand = sandPct;
  const silt = 100 - clay - sand;
  if (silt + 1.5 * clay < 15) return "sand";
  if (silt + 1.5 * clay < 30) return "loamy_sand";
  if (
    (clay < 7 && silt < 50 && silt + 2 * clay >= 30) ||
    (clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30)
  ) {
    return "sandy_loam";
  }
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "loam";
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12))
    return "silt_loam";
  if (silt >= 80 && clay < 12) return "silt";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "sandy_clay_loam";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "clay_loam";
  if (clay >= 27 && clay < 40 && sand <= 20) return "silty_clay_loam";
  if (clay >= 35 && sand > 45) return "sandy_clay";
  if (clay >= 40 && silt >= 40) return "silty_clay";
  if (clay >= 40) return "clay";
  return "loam";
}

/**
 * Midpoints of FAO-56 Table 19 ranges: [REW, TEW, available water in mm/m]. Classes that Table 19
 * does not list use the nearest listed class (sandy clay loam: sandy loam; clay loam: silty clay
 * loam; sandy clay: clay).
 */
const TABLE_19: Record<TextureClass, readonly [number, number, number]> = {
  sand: [4.5, 9, 80],
  loamy_sand: [6, 11.5, 90],
  sandy_loam: [8, 17.5, 130],
  loam: [9, 19, 155],
  silt_loam: [9.5, 21.5, 160],
  silt: [9.5, 24, 180],
  sandy_clay_loam: [8, 17.5, 145],
  clay_loam: [9.5, 24.5, 155],
  silty_clay_loam: [9.5, 24.5, 155],
  sandy_clay: [10, 25.5, 140],
  silty_clay: [10, 25, 160],
  clay: [10, 25.5, 160],
};

/** SCS hydrologic soil group by texture (NRCS National Engineering Handbook, part 630 ch. 7). */
const GROUP: Record<TextureClass, HydrologicGroup> = {
  sand: "A",
  loamy_sand: "A",
  sandy_loam: "A",
  loam: "B",
  silt_loam: "B",
  silt: "B",
  sandy_clay_loam: "C",
  clay_loam: "D",
  silty_clay_loam: "D",
  sandy_clay: "D",
  silty_clay: "D",
  clay: "D",
};

/** Physical soil parameters from a bundle's `soil` block. Sourced values (ground truth) are used as given. */
export function soilParams(soil: Soil): SoilParams {
  const clay = soil.clay_pct?.value;
  const sand = soil.sand_pct?.value;
  const depthCm = soil.depth_cm?.value;
  const known = clay !== undefined && sand !== undefined;
  const texture = known ? textureClass(clay, sand) : "loam";
  const [rewMm, tewMm, tableAwc] = TABLE_19[texture];
  return {
    texture,
    assumedTexture: !known,
    awcMmPerM: soil.awc_mm_per_m?.value ?? tableAwc,
    hydrologicGroup: GROUP[texture],
    rewMm,
    tewMm,
    maxRootDepthM: depthCm !== undefined && depthCm > 0 ? depthCm / 100 : Number.POSITIVE_INFINITY,
  };
}
