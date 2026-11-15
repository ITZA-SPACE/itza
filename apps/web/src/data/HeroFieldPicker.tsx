import { cn, focusRing } from "@itza/ui-kit";
import { Check, ChevronRight } from "lucide-react";
import { type CopyKey, hasCopy, t } from "../copy";
import { fieldMetrics } from "../map/geometry";
import { type FieldPolygon, useFieldStore } from "../state";
import { HERO_FIELDS, type HeroField } from "./hero";
import { heroIdFor } from "./useFieldBundle";

/** Copy for a hero field, falling back to its id when a field has no entry yet. */
function label(kind: "name" | "note", id: string): string {
  const key = `hero.${kind}.${id}`;
  return hasCopy(key) ? t(key as CopyKey) : id;
}

/**
 * The precomputed demo fields as one compact list: each row opens its field (data saved in the app,
 * works offline). The open field carries a check.
 */
export function HeroFieldPicker({ onPick }: { onPick?: () => void }) {
  const field = useFieldStore((s) => s.field);
  const current = heroIdFor(field?.geometry);
  const open = (hero: HeroField) => {
    useFieldStore
      .getState()
      .selectField({ id: null, ...fieldMetrics(hero.geometry as FieldPolygon, "drawn") });
    onPick?.();
  };

  return (
    <section aria-labelledby="hero-picker-title" className="space-y-2">
      <h2
        id="hero-picker-title"
        className="text-[0.75rem] leading-4 font-bold tracking-[0.06em] text-ink-muted uppercase"
      >
        {t("hero.picker.title")}
      </h2>
      <ul className="glass-panel list-none divide-y divide-line-soft overflow-hidden rounded-card p-0">
        {HERO_FIELDS.map((hero) => {
          const isCurrent = current === hero.id;
          return (
            <li key={hero.id}>
              <button
                type="button"
                onClick={() => open(hero)}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-glass",
                  focusRing,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {label("name", hero.id)}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">
                    {t(`hero.role.${hero.role}`)} · {label("note", hero.id)}
                  </span>
                </span>
                {isCurrent ? (
                  <Check
                    aria-label={t("hero.picker.current")}
                    className="size-5 shrink-0 text-good-ink"
                  />
                ) : (
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-subtle">{t("hero.picker.sampling")}</p>
    </section>
  );
}
