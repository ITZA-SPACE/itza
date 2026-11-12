import { create } from "zustand";

/** An assistant answer the farmer pinned to the rotation card ("Add to card", F-15). */
export interface PinnedAnswer {
  id: string;
  title: string;
  text: string;
}

interface PinnedState {
  pinned: PinnedAnswer[];
  /** Adds the answer, or replaces the one with the same id. */
  pin: (answer: PinnedAnswer) => void;
  unpin: (id: string) => void;
}

/** The slot the printed card reads; the assistant fills it. */
export const usePinnedStore = create<PinnedState>((set) => ({
  pinned: [],
  pin: (answer) =>
    set((s) => ({ pinned: [...s.pinned.filter((p) => p.id !== answer.id), answer] })),
  unpin: (id) => set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) })),
}));
