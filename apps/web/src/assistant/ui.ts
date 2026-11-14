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

/** The control that opened the panel; focus goes back to it when the panel closes. */
let opener: HTMLElement | null = null;

function rememberOpener() {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
}

function restoreFocus() {
  const target = opener;
  opener = null;
  // After Radix has finished closing, so its own focus handling does not win.
  if (target) setTimeout(() => target.isConnected && target.focus(), 0);
}

export const useAssistantUi = create<AssistantUi>()((set, get) => ({
  open: false,
  mounted: false,
  queued: null,
  setOpen: (open) => {
    const was = get().open;
    if (open && !was) rememberOpener();
    if (!open && was) restoreFocus();
    set((s) => ({ open, mounted: s.mounted || open }));
  },
  ask: (queued) => {
    if (!get().open) rememberOpener();
    set({ open: true, mounted: true, queued });
  },
  take: () => {
    const { queued } = get();
    if (queued !== null) set({ queued: null });
    return queued;
  },
}));
