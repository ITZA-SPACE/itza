import { hasCopy, t } from "../../copy";
import { useFieldBundle } from "../../data/useFieldBundle";
import { useSettled } from "../../lib/useSettled";
import { useFieldStore } from "../../state";

// Wait for the outline to settle, so dragging a corner does not start a load on every frame.
const SETTLE_MS = 800;

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
      <h3
        id="field-sources-title"
        className="text-[0.75rem] leading-4 font-bold tracking-[0.06em] text-ink-muted uppercase"
      >
        {t("workspace.data.title")}
      </h3>
      <ul aria-live="polite" className="flex list-none flex-wrap gap-2 p-0 text-caption">
        {rows.map((row) => (
          <li
            key={row.id}
            className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-glass px-3 py-1"
          >
            <span className="text-ink">{row.label}</span>
            <span className="text-ink-muted">· {row.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
