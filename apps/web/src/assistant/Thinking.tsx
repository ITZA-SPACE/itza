import { useEffect, useState } from "react";
import { type CopyKey, t } from "../copy";

/** After this long the indicator adds a line saying that satellite data can be slow. */
const SLOW_AFTER_MS = 8_000;

/**
 * The waiting indicator: a small globe with a satellite orbiting it and the step being worked on.
 * It is only decoration for the eye (the live region in the panel announces each step once), and
 * with reduced motion the globe and the dots stand still.
 */
export function Thinking({ step }: { step: CopyKey }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      aria-hidden="true"
      data-testid="thinking"
      className="flex items-center gap-3 rounded-card bg-surface-muted p-3 transition duration-300 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      <span className="relative inline-block size-9 shrink-0">
        <span className="absolute inset-1.5 rounded-full bg-gradient-to-br from-accent-soft to-accent/50 ring-1 ring-accent/30" />
        <span className="absolute inset-0 motion-safe:animate-spin motion-safe:[animation-duration:2.4s]">
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-accent" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-body text-ink">
          <span>{t(step)}</span>
          <span className="inline-flex gap-0.5" data-testid="dots">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                style={{ animationDelay: `${delay}ms` }}
                className="size-1 rounded-full bg-ink-muted motion-safe:animate-bounce"
              />
            ))}
          </span>
        </span>
        {slow ? (
          <span className="block text-caption text-ink-muted">{t("assistant.step.slow")}</span>
        ) : null}
      </span>
    </div>
  );
}
