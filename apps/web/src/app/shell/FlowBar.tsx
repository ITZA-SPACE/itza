import type { ReactNode } from "react";

/**
 * Figma "question bar": one plain question about the screen and at most two actions, the primary
 * one last. It closes every step of the guided flow, so the next move is always in the same place.
 */
export function FlowBar({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-card px-5 py-4">
      <p className="font-display text-title font-semibold text-ink">{question}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
