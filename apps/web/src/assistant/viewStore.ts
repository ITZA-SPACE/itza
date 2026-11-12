import { create } from "zustand";
import type { SourceView } from "./views";

export interface ToolEntry {
  tool: string;
  summary: string;
  view: Record<string, unknown>;
  sources: SourceView[];
}

interface ViewState {
  /** What each browser tool call produced for the answer components, by tool call id. */
  byCall: Record<string, ToolEntry>;
  /** Data an action chip replaced in one answer, by message id. */
  overrides: Record<string, Record<string, unknown>>;
  record: (callId: string, entry: ToolEntry) => void;
  override: (messageId: string, view: Record<string, unknown>) => void;
  reset: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  byCall: {},
  overrides: {},
  record: (callId, entry) => set((s) => ({ byCall: { ...s.byCall, [callId]: entry } })),
  override: (messageId, view) =>
    set((s) => ({
      overrides: { ...s.overrides, [messageId]: { ...s.overrides[messageId], ...view } },
    })),
  reset: () => set({ byCall: {}, overrides: {} }),
}));
