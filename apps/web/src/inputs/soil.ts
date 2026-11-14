import { GENERIC_SOIL_DEFAULTS } from "@itza/adapters-browser";
import type { FieldBundle, Soil } from "@itza/engine/contracts";
import { textureClass } from "@itza/engine/physics";
import type { CopyKey } from "../copy";

export type SoilKey = "clay_pct" | "sand_pct" | "soc_pct" | "ph" | "awc_mm_per_m" | "depth_cm";

export interface SoilField {
  key: SoilKey;
  label: CopyKey;
  unit: CopyKey;
  min: number;
  max: number;
  step: number;
  digits: number;
}

/** The soil properties of the form, in reading order. Ranges are what the engine can use. */
export const SOIL_FIELDS: readonly SoilField[] = [
  {
    key: "clay_pct",
    label: "inputs.soil.clay",
    unit: "inputs.unit.percent",
    min: 0,
    max: 100,
    step: 1,
    digits: 0,
  },
  {
    key: "sand_pct",
    label: "inputs.soil.sand",
    unit: "inputs.unit.percent",
    min: 0,
    max: 100,
    step: 1,
    digits: 0,
  },
  {
    key: "soc_pct",
    label: "inputs.soil.soc",
    unit: "inputs.unit.percent",
    min: 0,
    max: 20,
    step: 0.1,
    digits: 1,
  },
  {
    key: "ph",
    label: "inputs.soil.ph",
    unit: "inputs.unit.ph",
    min: 3,
    max: 10,
    step: 0.1,
    digits: 1,
  },
  {
    key: "awc_mm_per_m",
    label: "inputs.soil.awc",
    unit: "inputs.unit.mmPerM",
    min: 20,
    max: 300,
    step: 5,
    digits: 0,
  },
  {
    key: "depth_cm",
    label: "inputs.soil.depth",
    unit: "inputs.unit.cm",
    min: 10,
    max: 300,
    step: 5,
    digits: 0,
  },
];

export const FARMER_SOURCE = "farmer";
export const DEFAULT_SOURCE = "regional_default";

/** What the form shows when neither the farmer nor the satellites gave a value. */
export const SOIL_DEFAULTS: Record<SoilKey, number> = {
  clay_pct: GENERIC_SOIL_DEFAULTS.clay_pct,
  sand_pct: GENERIC_SOIL_DEFAULTS.sand_pct,
  soc_pct: GENERIC_SOIL_DEFAULTS.soc_pct,
  ph: GENERIC_SOIL_DEFAULTS.ph,
  awc_mm_per_m: GENERIC_SOIL_DEFAULTS.awc_mm_per_m,
  depth_cm: 100,
};

/** Where a shown value comes from: the farmer, a satellite product, or a default. */
export type SoilOrigin = "farmer" | "satellite" | "default";

export interface ShownSoil {
  value: number;
  source: string;
  confidence: "high" | "medium" | "low";
  origin: SoilOrigin;
}

function originOf(source: string): SoilOrigin {
  if (source === FARMER_SOURCE) return "farmer";
  return source === DEFAULT_SOURCE ? "default" : "satellite";
}

/** The value of one property: the farmer's, else the bundle's (SoilGrids), else a labeled default. */
export function shownSoil(key: SoilKey, bundleSoil: Soil | undefined, overrides: Soil): ShownSoil {
  const found = overrides[key] ?? bundleSoil?.[key];
  if (found) return { ...found, origin: originOf(found.source) };
  return {
    value: SOIL_DEFAULTS[key],
    source: DEFAULT_SOURCE,
    confidence: "low",
    origin: "default",
  };
}

/** The soil the engine gets: the bundle's values with the farmer's on top. */
export function effectiveSoil(
  bundle: Pick<FieldBundle, "soil"> | undefined,
  overrides: Soil,
): Soil {
  return { ...bundle?.soil, ...overrides };
}

/** The properties the water balance cannot do without. Texture and water capacity must not be defaults. */
const REQUIRED: readonly SoilKey[] = ["clay_pct", "sand_pct", "awc_mm_per_m"];

export function soilIsSet(bundleSoil: Soil | undefined, overrides: Soil): boolean {
  return REQUIRED.every((key) => shownSoil(key, bundleSoil, overrides).origin !== "default");
}

/** The USDA texture class of the shown clay and sand, for a plain-language label. */
export function shownTexture(bundleSoil: Soil | undefined, overrides: Soil): string {
  const clay = shownSoil("clay_pct", bundleSoil, overrides).value;
  const sand = shownSoil("sand_pct", bundleSoil, overrides).value;
  return textureClass(clay, sand);
}
