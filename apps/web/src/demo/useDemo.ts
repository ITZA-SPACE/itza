import { create } from "zustand";
import type { FieldGeometry } from "../state";
import { useFieldStore } from "../state";
import { DEMO_SCENARIO, DEMO_STEP_IDS, proofField, storyField } from "./constants";

interface DemoState {
  index: number;
  /** Play mode: the script advances by itself on the step timings. */
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  next: () => void;
  prev: () => void;
  goto: (index: number) => void;
  reset: () => void;
}

function sameOutline(a: FieldGeometry | null, b: FieldGeometry): boolean {
  return a !== null && JSON.stringify(a.geometry) === JSON.stringify(b.geometry);
}

/** Fixed store state for each step, applied before it is shown (DEMO_STRATEGY.md §3). */
function applyStep(index: number): void {
  const store = useFieldStore.getState();
  const id = DEMO_STEP_IDS[index];
  if (id === "title") {
    store.selectField(null);
    return;
  }
  // The validation beat is on the proof field; every other beat is on the story field.
  const wanted = id === "validation" ? proofField() : storyField();
  if (!sameOutline(store.field, wanted)) store.selectField(wanted);
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
  playing: false,
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  next: () => {
    const index = Math.min(get().index + 1, DEMO_STEP_IDS.length - 1);
    applyStep(index);
    set({ index, playing: index < DEMO_STEP_IDS.length - 1 && get().playing });
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
    set({ index: 0, playing: false });
  },
}));
