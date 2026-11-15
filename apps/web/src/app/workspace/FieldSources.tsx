import { Tooltip } from "@itza/ui-kit";
import { hasCopy, t } from "../../copy";
import { useFieldBundle } from "../../data/useFieldBundle";
import { useSettled } from "../../lib/useSettled";
import { useFieldStore } from "../../state";

// Wait for the outline to settle, so dragging a corner does not start a load on every frame.
const SETTLE_MS = 800;

/**
 * Starts loading the field's bundle when its outline changes. Shows one status line (ready, or how
 * many sources are still loading); each source and its state is in the tooltip.
 */
export function FieldSources() {
  const geometry = useFieldStore((s) => s.field?.geometry);
  const { sources } = useFieldBundle(useSettled(geometry, SETTLE_MS));
  const rows = Object.entries(sources).flatMap(([id, status]) => {
    const key = `data.source.${id}`;
    return hasCopy(key) ? [{ id, label: t(key), status }] : [];
  });
  if (rows.length === 0) return null;
  const busy = rows.filter((r) => r.status === "pending" || r.status === "loading").length;
  const failed = rows.filter((r) => r.status === "error").length;
  const text = busy
    ? t("data.summary.loading").replace("{n}", String(busy))
    : failed
      ? t("data.summary.partial").replace("{n}", String(failed))
      : t("data.summary.ready");
  return (
    <Tooltip
      content={
        <ul className="list-none space-y-1 p-0">
          {rows.map((row) => (
            <li key={row.id}>
              {row.label} · {t(`data.status.${row.status}`)}
            </li>
          ))}
        </ul>
      }
    >
      <button
        type="button"
        aria-live="polite"
        className="flex items-center gap-2 rounded-control text-caption text-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span
          aria-hidden="true"
          className={`size-[7px] rounded-full ${busy ? "animate-pulse bg-rain" : failed ? "bg-warn-ink" : "bg-good-ink"}`}
        />
        {text}
      </button>
    </Tooltip>
  );
}
