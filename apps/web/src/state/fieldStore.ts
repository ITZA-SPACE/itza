import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { emptyWork } from "./defaults";
import { fieldIdOf } from "./fieldId";
import { loadLastSnapshot, loadSnapshot, saveSnapshot, snapshotOf } from "./persistence";
import type { FieldGeometry, FieldWork } from "./types";

interface FieldState extends FieldWork {
  field: FieldGeometry | null;
}

interface FieldActions {
  /** Selects another field with clean work; work saved for the same outline is restored once its id is known. */
  selectField: (field: FieldGeometry | null) => void;
  /** Replaces the outline of the selected field (an edit), keeping its work. */
  updateField: (field: FieldGeometry) => void;
  setConfirmedHistory: (history: FieldWork["confirmedHistory"]) => void;
  setInputs: (inputs: Partial<FieldWork["inputs"]>) => void;
  setPriorities: (priorities: FieldWork["priorities"]) => void;
  setScenario: (scenario: FieldWork["scenario"]) => void;
  setGroundTruth: (groundTruth: Partial<FieldWork["groundTruth"]>) => void;
  /** Brings back the field worked on last, if the browser remembers one. */
  restoreLast: () => void;
}

export type FieldStore = FieldState & FieldActions;

const SAVE_DELAY_MS = 300;

export const useFieldStore = create<FieldStore>()(
  subscribeWithSelector((set, get) => ({
    field: null,
    ...emptyWork(),

    selectField: (field) => {
      if (!field) {
        set({ field: null, ...emptyWork() });
        return;
      }
      // A different field starts from clean work; saved work for the same outline comes back below.
      set({ field: { ...field, id: field.id ?? null }, ...emptyWork() });
      resolveId(field, get, set, true);
    },
    updateField: (field) => {
      // Reshaping the outline keeps what the farmer entered; only the id follows the new shape.
      set({ field: { ...field, id: field.id ?? null } });
      resolveId(field, get, set, false);
    },
    setConfirmedHistory: (confirmedHistory) => set({ confirmedHistory }),
    setInputs: (inputs) => set((s) => ({ inputs: { ...s.inputs, ...inputs } })),
    setPriorities: (priorities) => set({ priorities }),
    setScenario: (scenario) => set({ scenario }),
    setGroundTruth: (groundTruth) =>
      set((s) => ({ groundTruth: { ...s.groundTruth, ...groundTruth } })),
    restoreLast: () => {
      const saved = loadLastSnapshot();
      if (saved) set({ field: saved.field, ...workOf(saved) });
    },
  })),
);

/** Computes the field id and, for a newly selected field, restores any work saved under it. */
function resolveId(
  field: FieldGeometry,
  get: () => FieldStore,
  set: (partial: Partial<FieldStore>) => void,
  restore: boolean,
): void {
  if (field.id) return;
  void fieldIdOf(field.geometry).then((id) => {
    const current = get().field;
    if (!current || current.geometry !== field.geometry) return;
    const saved = restore ? loadSnapshot(id) : null;
    set({ field: { ...current, id }, ...(saved ? workOf(saved) : {}) });
  });
}

function workOf(work: FieldWork): FieldWork {
  return {
    confirmedHistory: work.confirmedHistory,
    inputs: work.inputs,
    priorities: work.priorities,
    scenario: work.scenario,
    groundTruth: work.groundTruth,
  };
}

/** The work state of the current store contents. */
export function currentWork(state: FieldStore): FieldWork {
  return workOf(state);
}

/** Saves the selected field and its work shortly after every change, so overrides survive a reload. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useFieldStore.subscribe(
    (s) => s,
    (state) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (state.field?.id) saveSnapshot(snapshotOf(state.field, workOf(state)));
      }, SAVE_DELAY_MS);
    },
  );
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/**
 * Calls `listener` whenever the selected outline changes (a new field, an edited outline or none).
 * Bundle loading (#9) hooks in here. Edits that leave the outline alone do not fire.
 */
export function onFieldChange(listener: (field: FieldGeometry | null) => void): () => void {
  return useFieldStore.subscribe(
    (s) => s.field?.geometry ?? null,
    () => listener(useFieldStore.getState().field),
  );
}
