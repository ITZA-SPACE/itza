import type { SoilVar } from "../canonical";
import { SOIL_VARS } from "../canonical";
import type { SourceEntry } from "../manifest";
import type { Capabilities, FetchRequest, Gap } from "../types";
import { asNumber, gap, isRecord } from "../util";
import { type AdapterDeps, capabilitiesOf } from "./common";

type Confidence = "high" | "medium" | "low";
export interface SoilValue {
  value: number;
  source: string;
  confidence: Confidence;
}
export type Soil = Record<string, SoilValue>;

export interface SoilResult {
  soil: Soil;
  gaps: Gap[];
}

/** Generic loam used when SoilGrids has no value; regional packs can pass their own. */
export const GENERIC_SOIL_DEFAULTS: Record<SoilVar, number> = {
  clay_pct: 25,
  sand_pct: 40,
  silt_pct: 35,
  soc_pct: 1,
  ph: 7,
  awc_mm_per_m: 140,
};

const DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"] as const;
/** The crop root zone is taken as the top metre. */
const ROOT_ZONE_CM = 100;
const DEFAULT_SOURCE = "regional_default";

interface Layer {
  /** Depth range weight in centimetres inside the root zone. */
  thickness: number;
  value: number | null;
}

/** Converts a mapped SoilGrids value to the soil variable's unit. */
const SCALE: Partial<Record<SoilVar, number>> = {
  // g/kg -> % for texture is /10 (handled by d_factor); soc g/kg -> % is a further /10.
  soc_pct: 0.1,
};

function parseLayers(data: unknown): Map<string, Layer[]> | undefined {
  if (!isRecord(data) || !isRecord(data.properties) || !Array.isArray(data.properties.layers)) {
    return undefined;
  }
  const out = new Map<string, Layer[]>();
  for (const layer of data.properties.layers) {
    if (!isRecord(layer) || typeof layer.name !== "string" || !Array.isArray(layer.depths))
      continue;
    const factor = isRecord(layer.unit_measure) ? asNumber(layer.unit_measure.d_factor) : null;
    const layers: Layer[] = [];
    for (const depth of layer.depths) {
      if (!isRecord(depth) || !isRecord(depth.range)) continue;
      const top = asNumber(depth.range.top_depth) ?? 0;
      const bottom = Math.min(asNumber(depth.range.bottom_depth) ?? 0, ROOT_ZONE_CM);
      const raw = isRecord(depth.values) ? asNumber(depth.values.mean) : null;
      if (bottom <= top) continue;
      layers.push({
        thickness: bottom - top,
        value: raw === null || !factor ? null : raw / factor,
      });
    }
    out.set(layer.name, layers);
  }
  return out;
}

function weighted(layers: Layer[]): { value: number; complete: boolean } | undefined {
  const present = layers.filter((l) => l.value !== null);
  const weight = present.reduce((sum, l) => sum + l.thickness, 0);
  if (weight === 0) return undefined;
  const total = present.reduce((sum, l) => sum + l.thickness * (l.value ?? 0), 0);
  return { value: total / weight, complete: present.length === DEPTHS.length };
}

/** Field capacity minus wilting point per depth, in mm of water per metre of soil. */
function availableWater(fc: Layer[] | undefined, wp: Layer[] | undefined): Layer[] | undefined {
  if (!fc || !wp) return undefined;
  return fc.map((layer, i) => {
    const point = wp[i];
    const fieldCapacity = layer.value;
    const wiltingPoint = point?.value ?? null;
    // Volumetric percent difference x 10 = mm per metre.
    const value =
      fieldCapacity === null || wiltingPoint === null ? null : (fieldCapacity - wiltingPoint) * 10;
    return { thickness: layer.thickness, value };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** SoilGrids v2 point query with a regional-default fallback. Every value carries its source. */
export class SoilGridsAdapter {
  readonly id: string;

  constructor(
    private readonly entry: SourceEntry,
    private readonly deps: AdapterDeps,
    private readonly defaults: Record<SoilVar, number> = GENERIC_SOIL_DEFAULTS,
  ) {
    this.id = entry.id;
  }

  capabilities(): Capabilities {
    return capabilitiesOf(this.entry);
  }

  private properties(): string[] {
    const names = new Set<string>();
    for (const mapping of Object.values(this.entry.variables)) {
      for (const name of mapping.source_var.split("-")) names.add(name);
    }
    return [...names];
  }

  private fallback(variables: SoilVar[]): Soil {
    return Object.fromEntries(
      variables.map((v) => [
        v,
        { value: this.defaults[v], source: DEFAULT_SOURCE, confidence: "low" as const },
      ]),
    );
  }

  async fetchSoil(
    req: Pick<FetchRequest, "lat" | "lon">,
    signal?: AbortSignal,
  ): Promise<SoilResult> {
    const variables = SOIL_VARS.filter((v) => v in this.entry.variables);
    const query = [
      `lon=${req.lon}`,
      `lat=${req.lat}`,
      ...this.properties().map((p) => `property=${p}`),
      ...DEPTHS.map((d) => `depth=${d}`),
      "value=mean",
    ].join("&");
    const response = await this.deps.http.getJson(`${this.entry.endpoint}?${query}`, signal);
    if (!response.ok) {
      return {
        soil: this.fallback(variables),
        gaps: [gap("soil", `SoilGrids unavailable: ${response.reason}; using regional defaults`)],
      };
    }
    const layers = parseLayers(response.data);
    if (!layers) {
      return {
        soil: this.fallback(variables),
        gaps: [gap("soil", "SoilGrids returned an unexpected response; using regional defaults")],
      };
    }
    const soil: Soil = {};
    const gaps: Gap[] = [];
    for (const variable of variables) {
      const source = this.entry.variables[variable]?.source_var ?? "";
      const [first, second] = source.split("-");
      const perDepth =
        second !== undefined
          ? availableWater(layers.get(first ?? ""), layers.get(second))
          : layers.get(source);
      const result = perDepth ? weighted(perDepth) : undefined;
      if (!result) {
        soil[variable] = this.fallback([variable])[variable] as SoilValue;
        gaps.push(
          gap(variable, `SoilGrids has no value for ${variable} here; using regional default`),
        );
        continue;
      }
      soil[variable] = {
        value: round(result.value * (SCALE[variable] ?? 1)),
        source: this.entry.id,
        confidence: result.complete ? "medium" : "low",
      };
    }
    return { soil, gaps };
  }
}
