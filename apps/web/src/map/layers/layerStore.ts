import { create } from "zustand";
import type { FootprintKind } from "./footprints";

export type CompareMode = "off" | "dates" | "layers";

interface LayerState {
  /** Whether the layer panel is on screen; the map draws layers and footprints only then. */
  shown: boolean;
  activeId: string;
  compare: CompareMode;
  /** Second date when comparing two dates; null picks a year before the timeline date. */
  dateB: string | null;
  /** Second layer when comparing two layers; null picks the first other layer. */
  layerB: string | null;
  /** Where the divider sits across the field, 0 (west edge) to 1 (east edge). */
  split: number;
  footprints: Record<FootprintKind, boolean>;
  setShown: (shown: boolean) => void;
  setActive: (id: string) => void;
  setCompare: (mode: CompareMode) => void;
  setDateB: (date: string) => void;
  setLayerB: (id: string) => void;
  setSplit: (split: number) => void;
  setFootprint: (kind: FootprintKind, on: boolean) => void;
}

export const useLayerState = create<LayerState>()((set) => ({
  shown: false,
  activeId: "ndvi",
  compare: "off",
  dateB: null,
  layerB: null,
  split: 0.5,
  footprints: { smap: false, power: false, modis: false },
  setShown: (shown) => set({ shown }),
  setActive: (activeId) => set({ activeId }),
  setCompare: (compare) => set({ compare }),
  setDateB: (dateB) => set({ dateB }),
  setLayerB: (layerB) => set({ layerB }),
  setSplit: (split) => set({ split }),
  setFootprint: (kind, on) => set((s) => ({ footprints: { ...s.footprints, [kind]: on } })),
}));
