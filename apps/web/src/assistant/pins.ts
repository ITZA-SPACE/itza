import type { A2uiMessage } from "@itza/ui-kit/catalog";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "../lib/safeStorage";

/** An answer kept in the workspace: its surface and the data it binds to, so it draws again later. */
export interface PinnedSurface {
  id: string;
  fieldId: string | null;
  question: string;
  caption: string;
  messages: A2uiMessage[];
  data: Record<string, unknown>;
}

/** Few enough that the saved data stays well inside the browser's storage. */
export const MAX_PINS = 8;

interface PinState {
  pins: PinnedSurface[];
  pin: (pin: PinnedSurface) => void;
  unpin: (id: string) => void;
}

export const usePins = create<PinState>()(
  persist(
    (set) => ({
      pins: [],
      pin: (pin) =>
        set((s) => ({ pins: [...s.pins.filter((p) => p.id !== pin.id), pin].slice(-MAX_PINS) })),
      unpin: (id) => set((s) => ({ pins: s.pins.filter((p) => p.id !== id) })),
    }),
    { name: "itza:assistant:pins", storage: createJSONStorage(() => safeStorage) },
  ),
);

/**
 * The surface without its action chips. A chip runs a tool against the open answer; a pinned
 * answer is a record, so its chips would do nothing.
 */
export function withoutChips(messages: readonly A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const update = message.updateComponents as
      | { components: { id: string; component: string; children?: string[] }[] }
      | undefined;
    if (!update) return message;
    const chips = new Set(
      update.components.filter((c) => c.component === "ActionChips").map((c) => c.id),
    );
    return {
      ...message,
      updateComponents: {
        ...update,
        components: update.components
          .filter((c) => !chips.has(c.id))
          .map((c) =>
            c.children ? { ...c, children: c.children.filter((id) => !chips.has(id)) } : c,
          ),
      },
    };
  });
}
