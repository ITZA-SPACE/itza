import { create } from "zustand";

interface AssistantUi {
  open: boolean;
  /** The panel has been opened once, so its code is loaded and its conversation kept. */
  mounted: boolean;
  /** A question waiting for the panel to send it. */
  queued: string | null;
  setOpen: (open: boolean) => void;
  ask: (question: string) => void;
  take: () => string | null;
}

export const useAssistantUi = create<AssistantUi>()((set, get) => ({
  open: false,
  mounted: false,
  queued: null,
  setOpen: (open) => set((s) => ({ open, mounted: s.mounted || open })),
  ask: (queued) => set({ open: true, mounted: true, queued }),
  take: () => {
    const { queued } = get();
    if (queued !== null) set({ queued: null });
    return queued;
  },
}));
