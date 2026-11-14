import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

export interface MethodsTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

interface State {
  open: boolean;
  tabs: readonly MethodsTab[];
}

let state: State = { open: false, tabs: [] };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMethodsState(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export function setMethodsOpen(open: boolean) {
  set({ ...state, open });
}

/** Lets other features add a tab to the Methods drawer. Returns an unregister function. */
export function registerMethodsTab(tab: MethodsTab): () => void {
  set({ ...state, tabs: [...state.tabs.filter((t) => t.id !== tab.id), tab] });
  return () => set({ ...state, tabs: state.tabs.filter((t) => t.id !== tab.id) });
}
