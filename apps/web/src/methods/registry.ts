import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

export interface MethodsTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

export const SUMMARY_TAB = "summary";
export const CREDITS_TAB = "credits";

interface State {
  open: boolean;
  tab: string;
  tabs: readonly MethodsTab[];
}

let state: State = { open: false, tab: SUMMARY_TAB, tabs: [] };
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

/** Opens or closes the drawer; `tab` picks the tab shown on open (default: formulas). */
export function setMethodsOpen(open: boolean, tab: string = SUMMARY_TAB) {
  set({ ...state, open, tab: open ? tab : state.tab });
}

export function setMethodsTab(tab: string) {
  set({ ...state, tab });
}

/** Lets other features add a tab to the Methods drawer. Returns an unregister function. */
export function registerMethodsTab(tab: MethodsTab): () => void {
  set({ ...state, tabs: [...state.tabs.filter((t) => t.id !== tab.id), tab] });
  return () => set({ ...state, tabs: state.tabs.filter((t) => t.id !== tab.id) });
}
