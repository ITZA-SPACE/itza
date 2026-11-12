import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "../lib/safeStorage";

/** An assistant answer the farmer pinned to the rotation card ("Add to card", F-15). */
export interface PinnedAnswer {
  id: string;
  /** The field it is about; the card of another field does not show it. */
  fieldId?: string | null;
  title: string;
  text: string;
}

interface PinnedState {
  pinned: PinnedAnswer[];
  /** Adds the answer, or replaces the one with the same id. */
  pin: (answer: PinnedAnswer) => void;
  unpin: (id: string) => void;
}

/** The slot the printed card reads; the assistant fills it. Kept in the browser so a reload keeps it. */
export const usePinnedStore = create<PinnedState>()(
  persist(
    (set) => ({
      pinned: [],
      pin: (answer) =>
        set((s) => ({ pinned: [...s.pinned.filter((p) => p.id !== answer.id), answer] })),
      unpin: (id) => set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) })),
    }),
    { name: "itza:card-answers", storage: createJSONStorage(() => safeStorage) },
  ),
);
