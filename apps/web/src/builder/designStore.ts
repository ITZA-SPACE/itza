import { create } from "zustand";

/** The most seasons a rotation can have: the engine's input schema allows eight. */
export const MAX_SEASONS = 8;
/** The fewest seasons a design needs before it can be scored. */
export const MIN_SEASONS = 3;

export interface Slot {
  /** Stable key of the slot, so a drag keeps its identity when crops repeat. */
  key: string;
  crop: string;
}

interface BuilderState {
  /** The design on the timeline, season by season. */
  slots: Slot[];
  /** Crops of the design last sent to the comparison; null until the farmer scores one. */
  scored: string[] | null;
  /** The slots were filled from the farmer's current rotation or by hand, so they are not reset. */
  started: boolean;
}

interface BuilderActions {
  /** Puts a crop on the timeline at `index` (the end by default); false when the timeline is full. */
  add: (crop: string, index?: number) => boolean;
  remove: (key: string) => void;
  move: (from: number, to: number) => void;
  /** Replaces the timeline, for the first fill from the current rotation. */
  start: (crops: readonly string[]) => void;
  clear: () => void;
  score: () => void;
  unscore: () => void;
}

let counter = 0;
const slotOf = (crop: string): Slot => ({ key: `slot-${++counter}`, crop });

export const useBuilderStore = create<BuilderState & BuilderActions>()((set, get) => ({
  slots: [],
  scored: null,
  started: false,
  add: (crop, index) => {
    const { slots } = get();
    if (slots.length >= MAX_SEASONS) return false;
    const at = index === undefined ? slots.length : Math.min(Math.max(index, 0), slots.length);
    set({ slots: [...slots.slice(0, at), slotOf(crop), ...slots.slice(at)], started: true });
    return true;
  },
  remove: (key) => set((s) => ({ slots: s.slots.filter((slot) => slot.key !== key) })),
  move: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.slots.length || to >= s.slots.length) {
        return s;
      }
      const slots = [...s.slots];
      const [moved] = slots.splice(from, 1);
      if (moved) slots.splice(to, 0, moved);
      return { slots };
    }),
  start: (crops) => set({ slots: crops.slice(0, MAX_SEASONS).map(slotOf), started: true }),
  clear: () => set({ slots: [], started: true }),
  score: () => set((s) => ({ scored: s.slots.map((slot) => slot.crop) })),
  unscore: () => set({ scored: null }),
}));
