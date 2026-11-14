import type { KnowledgePack } from "@itza/knowledge";
import { Button } from "@itza/ui-kit";
import { useId } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { setCurrentRotation } from "./actions";
import { MAX_SEASONS, type RotationSource } from "./rotation";

const SOURCE_COPY = {
  entered: "inputs.rotation.source.entered",
  confirmed: "inputs.rotation.source.confirmed",
  inferred: "inputs.rotation.source.inferred",
  none: "inputs.rotation.source.none",
} as const;

/**
 * The current rotation: the seasons of a repeating cycle, in order, each a crop of the region's
 * list. It starts from the confirmed history and any change is saved as the farmer's own rotation.
 */
export function RotationEditor({
  crops,
  source,
  pack,
}: {
  crops: readonly string[];
  source: RotationSource;
  pack: KnowledgePack;
}) {
  const id = useId();
  const names = new Map(pack.crops.map((c) => [c.id, c.name]));
  const options = pack.crops.map((c) => ({ id: c.id, name: c.name }));
  const replace = (next: string[]) => setCurrentRotation(next);
  const change = (i: number, crop: string) => replace(crops.map((c, j) => (j === i ? crop : c)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...crops];
    const [item] = next.splice(i, 1);
    if (item === undefined) return;
    next.splice(i + by, 0, item);
    replace(next);
  };
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("inputs.rotation.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("inputs.rotation.body")}</p>
        <p
          role="status"
          className={`text-caption font-medium ${source === "entered" || source === "confirmed" ? "text-good-ink" : "text-warn-ink"}`}
        >
          {t(SOURCE_COPY[source])}
        </p>
      </div>
      {crops.length === 0 ? (
        <p className="text-body text-ink-muted">{t("inputs.rotation.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {crops.map((crop, i) => {
            const selectId = `${id}-s${i}`;
            const options2 = names.has(crop) ? options : [...options, { id: crop, name: crop }];
            return (
              // The crop list is edited in place, so a season is identified by its position.
              // biome-ignore lint/suspicious/noArrayIndexKey: positions are the identity here
              <li key={i} className="flex flex-wrap items-center gap-2">
                <label htmlFor={selectId} className="w-24 text-body text-ink">
                  {fmt(t("inputs.rotation.season"), { n: i + 1 })}
                </label>
                <select
                  id={selectId}
                  value={crop}
                  onChange={(e) => change(i, e.target.value)}
                  className="min-h-11 rounded-control border border-line bg-surface px-3 text-body text-ink"
                >
                  {options2.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={i === 0}
                  aria-label={fmt(t("inputs.rotation.up"), { n: i + 1 })}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={i === crops.length - 1}
                  aria-label={fmt(t("inputs.rotation.down"), { n: i + 1 })}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={crops.length <= 1}
                  aria-label={fmt(t("inputs.rotation.remove"), { n: i + 1 })}
                  onClick={() => replace(crops.filter((_, j) => j !== i))}
                >
                  {t("inputs.rotation.removeLabel")}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={crops.length >= MAX_SEASONS}
          onClick={() => replace([...crops, options[0]?.id ?? "fallow"])}
        >
          {t("inputs.rotation.add")}
        </Button>
        {source === "entered" ? (
          <Button type="button" variant="secondary" onClick={() => setCurrentRotation(null)}>
            {t("inputs.rotation.reset")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
