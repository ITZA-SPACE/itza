import { create } from "zustand";

interface AssistantUi {
  /** The assistant has been opened once, so its code is loaded and its conversation kept. */
  mounted: boolean;
  /** A question waiting for the assistant to send it. */
  queued: string | null;
  /** The Ask ITZA page's container, where the conversation is drawn; null on other pages. */
  slot: HTMLElement | null;
  /** Loads the assistant (the Ask page calls it on arrival). */
  mount: () => void;
  /** Queues a question; the caller then goes to the Ask page, which sends it. */
  ask: (question: string) => void;
  take: () => string | null;
  setSlot: (slot: HTMLElement | null) => void;
}

/**
 * The assistant lives on its own page (`/ask`). Its chat stays mounted at the root once loaded, so
 * the conversation survives a trip to the map and back; the page only lends it a place to draw.
 */
export const useAssistantUi = create<AssistantUi>()((set, get) => ({
  mounted: false,
  queued: null,
  slot: null,
  mount: () => {
    if (!get().mounted) set({ mounted: true });
  },
  ask: (queued) => set({ mounted: true, queued }),
  take: () => {
    const { queued } = get();
    if (queued !== null) set({ queued: null });
    return queued;
  },
  setSlot: (slot) => set({ slot }),
}));
