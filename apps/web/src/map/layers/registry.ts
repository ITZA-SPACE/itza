import type { FieldBundle } from "@itza/engine/contracts";
import type { CopyKey } from "../../copy";
import type { DateRange } from "../timeline/periods";

export interface Provenance {
  source: string;
  resolution: string;
  period: string;
}

export interface Reading {
  /** The number shown, in the layer's unit. */
  value: number;
  /** Where on the colour ramp, 0 to 1. */
  fraction: number;
  provenance: Provenance;
}

export interface LayerContext {
  bundle: FieldBundle;
  /** The chosen month, season or year. */
  period: DateRange;
}

/**
 * A layer the panel can show. Other features (zones, NISAR in #23) call `registerLayer` with their
 * own copy keys and the panel lists them without being edited.
 */
export interface LayerDef {
  id: string;
  labelKey: CopyKey;
  /** One plain-language sentence. */
  captionKey: CopyKey;
  /** Template with `{n}` for the number, for example "{n} days". */
  valueKey: CopyKey;
  /** Two colours (low to high) or three (low, middle, high) for a layer centred on normal. */
  colors: string[];
  /** The bundle variable whose gap explains a missing layer. */
  gapVar?: string;
  compute: (context: LayerContext) => Reading | null;
}

const layers = new Map<string, LayerDef>();

export function registerLayer(def: LayerDef): void {
  layers.set(def.id, def);
}

export const listLayers = (): LayerDef[] => [...layers.values()];
export const getLayer = (id: string): LayerDef | undefined => layers.get(id);

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));

/** Colour at `fraction` (0 to 1) along the layer's ramp, as `#rrggbb`. */
export function rampColor(colors: string[], fraction: number): string {
  const f = Math.min(1, Math.max(0, fraction)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(f));
  const a = hex(colors[i] as string);
  const b = hex(colors[i + 1] as string);
  const mix = a.map((v, k) => Math.round(v + ((b[k] as number) - v) * (f - i)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
