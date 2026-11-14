import { create } from "zustand";

interface ArenaState {
  /** The field (geometry key) the notes belong to, so another field never shows them. */
  fieldKey: string | null;
  notes: string[];
  set: (fieldKey: string | null, notes: string[]) => void;
}

/** Disagreement notes of the Model Arena, read by the comparison to add them to its evidence cards' risks. */
export const useArenaStore = create<ArenaState>((set) => ({
  fieldKey: null,
  notes: [],
  set: (fieldKey, notes) => set({ fieldKey, notes }),
}));
