import { useCallback, useEffect, useRef } from "react";
import { type CompareState, useCompare } from "../compare/useCompare";
import { t } from "../copy";
import type { ReadyCompare } from "./tools";

const WAIT_MS = 90_000;

export class NoFieldError extends Error {
  constructor() {
    super(t("assistant.error.noField"));
  }
}

interface Waiter {
  resolve: (ready: ReadyCompare) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function settle(state: CompareState, waiter: Waiter): boolean {
  if (state.status === "ready" && state.view) {
    waiter.resolve({ view: state.view });
    return true;
  }
  if (state.status === "no-field") {
    waiter.reject(new NoFieldError());
    return true;
  }
  if (state.status === "error") {
    waiter.reject(state.error ?? new Error("comparison failed"));
    return true;
  }
  return false;
}

/**
 * Lets browser tools wait for the field's comparison without owning it: the comparison runs through
 * the same hook as the compare step, so the worker holds exactly what the screen shows.
 */
export function useCompareBridge(): () => Promise<ReadyCompare> {
  const state = useCompare();
  const latest = useRef(state);
  const waiters = useRef<Waiter[]>([]);

  useEffect(() => {
    latest.current = state;
    waiters.current = waiters.current.filter((waiter) => {
      const done = settle(state, waiter);
      if (done) clearTimeout(waiter.timer);
      return !done;
    });
  }, [state]);

  return useCallback(
    () =>
      new Promise<ReadyCompare>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.current = waiters.current.filter((w) => w !== waiter);
            reject(new Error(t("compare.loading.compute")));
          }, WAIT_MS),
        };
        if (settle(latest.current, waiter)) clearTimeout(waiter.timer);
        else waiters.current.push(waiter);
      }),
    [],
  );
}
