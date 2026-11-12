import { registerSW } from "virtual:pwa-register";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import type { BundleSnapshot } from "../data/types";

/** The event Chromium fires when the app can be installed; it is not in lib.dom. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** A new version is downloaded and waits for the farmer to reload. */
  updateReady: boolean;
  installEvent: InstallPromptEvent | null;
  installed: boolean;
}

export const usePwaStore = create<PwaState>(() => ({
  updateReady: false,
  installEvent: null,
  installed: false,
}));

let applyUpdate: (() => Promise<void>) | undefined;

/** Reloads into the new version. */
export function updateApp(): void {
  void applyUpdate?.();
}

/** Opens the browser's install prompt, if it offered one. */
export async function installApp(): Promise<void> {
  const event = usePwaStore.getState().installEvent;
  if (!event) return;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // A prompt can be used once; after it the browser fires a new event if the app is still installable.
  usePwaStore.setState({ installEvent: null, installed: outcome === "accepted" });
}

function hasFailedSource(data: BundleSnapshot | null | undefined): boolean {
  return Object.values(data?.sources ?? {}).includes("error");
}

/**
 * Registers the service worker and wires the install prompt. When the connection returns, live
 * fetches that failed while offline are run again (cached and finished bundles are left alone).
 */
export function startPwa(queryClient: QueryClient): void {
  applyUpdate = registerSW({
    onNeedRefresh: () => usePwaStore.setState({ updateReady: true }),
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    usePwaStore.setState({ installEvent: event as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () =>
    usePwaStore.setState({ installEvent: null, installed: true }),
  );
  window.addEventListener("online", () => {
    void queryClient.invalidateQueries({
      queryKey: ["field-bundle"],
      predicate: (query) => hasFailedSource(query.state.data as BundleSnapshot | null | undefined),
    });
  });
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** True when the page runs as an installed app, where the install button makes no sense. */
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
