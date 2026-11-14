import { useEffect, useState } from "react";
import { hasCopy, t } from "../../copy";
import { useFieldBundle } from "../../data/useFieldBundle";
import { useFieldStore } from "../../state";

// Wait for the outline to settle, so dragging a corner does not start a load on every frame.
const SETTLE_MS = 800;

function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Starts loading the field's bundle when its outline changes, and shows how each source is doing. */
export function FieldSources() {
  const geometry = useFieldStore((s) => s.field?.geometry);
  const { sources } = useFieldBundle(useSettled(geometry, SETTLE_MS));
  const rows = Object.entries(sources).flatMap(([id, status]) => {
    const key = `data.source.${id}`;
    return hasCopy(key) ? [{ id, label: t(key), status: t(`data.status.${status}`) }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="field-sources-title" className="space-y-2">
      <h3 id="field-sources-title" className="text-body font-semibold text-ink">
        {t("workspace.data.title")}
      </h3>
      <ul aria-live="polite" className="space-y-1 text-caption">
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between gap-2">
            <span className="text-ink">{row.label}</span>
            <span className="text-ink-muted">{row.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
