import { emptyWork } from "./defaults";
import type { FieldGeometry, FieldWork } from "./types";

const VERSION = 1;
const PREFIX = "itza:field:";
const LAST = "itza:last-field";

/** What is saved and shared for a field: its outline and everything the farmer entered. */
export interface FieldSnapshot extends FieldWork {
  version: typeof VERSION;
  field: FieldGeometry;
}

export function snapshotOf(field: FieldGeometry, work: FieldWork): FieldSnapshot {
  return {
    version: VERSION,
    field,
    confirmedHistory: work.confirmedHistory,
    inputs: work.inputs,
    priorities: work.priorities,
    scenario: work.scenario,
    groundTruth: work.groundTruth,
  };
}

/** Parses a saved or shared snapshot; anything that is not a current snapshot gives null. */
export function parseSnapshot(text: string): FieldSnapshot | null {
  try {
    const value = JSON.parse(text) as Partial<FieldSnapshot> | null;
    if (!value || value.version !== VERSION || !value.field?.geometry) return null;
    // Fields missing from an older or hand-made snapshot fall back to the defaults.
    return { ...emptyWork(), ...value } as FieldSnapshot;
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Saves a field's snapshot and marks it as the last one worked on. Storage may be full or blocked. */
export function saveSnapshot(snapshot: FieldSnapshot): void {
  const id = snapshot.field.id;
  const store = storage();
  if (!store || !id) return;
  try {
    store.setItem(PREFIX + id, JSON.stringify(snapshot));
    store.setItem(LAST, id);
  } catch {
    // Private mode or a full disk: the field still works, it just is not remembered.
  }
}

export function loadSnapshot(id: string): FieldSnapshot | null {
  const text = storage()?.getItem(PREFIX + id);
  return text ? parseSnapshot(text) : null;
}

export function loadLastSnapshot(): FieldSnapshot | null {
  const id = storage()?.getItem(LAST);
  return id ? loadSnapshot(id) : null;
}

/** Every field saved in this browser, newest-agnostic; entries that no longer parse are skipped. */
export function listSnapshots(): FieldSnapshot[] {
  const store = storage();
  if (!store) return [];
  const found: FieldSnapshot[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      const text = key?.startsWith(PREFIX) ? store.getItem(key) : null;
      const snapshot = text ? parseSnapshot(text) : null;
      if (snapshot) found.push(snapshot);
    }
  } catch {
    // Storage went away while reading: show what was read.
  }
  return found;
}

export function forgetSnapshot(id: string): void {
  const store = storage();
  try {
    store?.removeItem(PREFIX + id);
    if (store?.getItem(LAST) === id) store.removeItem(LAST);
  } catch {
    // Nothing to forget if storage is unavailable.
  }
}
