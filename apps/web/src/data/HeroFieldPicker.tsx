import { Button } from "@itza/ui-kit";
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

/** Opens one of the precomputed hero fields: their data is saved in the app and works offline. */
export function HeroFieldPicker() {
  const field = useFieldStore((s) => s.field);
  const current = heroIdFor(field?.geometry);
  const open = (hero: HeroField) =>
    useFieldStore
      .getState()
      .selectField({ id: null, ...fieldMetrics(hero.geometry as FieldPolygon, "drawn") });

  return (
    <section aria-labelledby="hero-picker-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="hero-picker-title" className="m-0 text-lg font-semibold text-title">
          {t("hero.picker.title")}
        </h2>
        <p className="m-0 text-body text-ink-muted">{t("hero.picker.body")}</p>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {HERO_FIELDS.map((hero) => (
          <li
            key={hero.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line-soft p-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 font-medium text-title">{label("name", hero.id)}</p>
              <p className="m-0 text-caption text-ink-muted">
                {t(`hero.role.${hero.role}`)}. {label("note", hero.id)}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => open(hero)}
              aria-current={current === hero.id ? "true" : undefined}
              disabled={current === hero.id}
            >
              {current === hero.id ? t("hero.picker.current") : t("hero.picker.open")}
            </Button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-caption text-ink-muted">{t("hero.picker.sampling")}</p>
    </section>
  );
}
