import { create } from "zustand";
import { useFieldStore } from "../state";
import { DEMO_SCENARIO, DEMO_STEP_IDS, storyField } from "./constants";

interface DemoState {
  index: number;
  next: () => void;
  prev: () => void;
  goto: (index: number) => void;
  reset: () => void;
}

/** Fixed store state for each step, applied before it is shown (DEMO_STRATEGY.md §3). */
function applyStep(index: number): void {
  const store = useFieldStore.getState();
  const id = DEMO_STEP_IDS[index];
  if (id === "title") {
    store.selectField(null);
    return;
  }
  if (!store.field) store.selectField(storyField());
  if (id === "replay" || id === "assistant") {
    store.setScenario({ id: "history", kind: "history" });
    store.setInputs({ acceptedDefaults: true });
  }
  if (id === "sliders") store.setScenario(DEMO_SCENARIO);
  if (id === "future" || id === "arena" || id === "close") {
    store.setScenario({ id: "history", kind: "history" });
  }
}

export const useDemo = create<DemoState>()((set, get) => ({
  index: 0,
  next: () => {
    const index = Math.min(get().index + 1, DEMO_STEP_IDS.length - 1);
    applyStep(index);
    set({ index });
  },
  prev: () => {
    const index = Math.max(get().index - 1, 0);
    applyStep(index);
    set({ index });
  },
  goto: (requested) => {
    const index = Math.max(0, Math.min(requested, DEMO_STEP_IDS.length - 1));
    applyStep(index);
    set({ index });
  },
  reset: () => {
    useFieldStore.getState().selectField(null);
    set({ index: 0 });
  },
}));
