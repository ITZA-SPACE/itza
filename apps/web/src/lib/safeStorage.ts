import type { StateStorage } from "zustand/middleware";

/** localStorage that never throws: private mode, blocked storage and a full disk just do not remember. */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Not remembered; the answer stays pinned until the page closes.
    }
  },
  removeItem: (key) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};
