import { type CopyKey, hasCopy, t } from "../../copy";
import { HERO_FIELDS } from "../../data/hero";
import { heroIdFor } from "../../data/useFieldBundle";
import { formatHectares } from "../../lib/format";
import { useFieldStore } from "../../state";

export interface ActiveField {
  /** "Story field", "Proof field" or "Your field". */
  kind: string;
  /** The place, or the area of a drawn field. */
  name: string;
}

/** What the shell shows about the selected field, or null before one is chosen. */
export function useActiveField(): ActiveField | null {
  const field = useFieldStore((s) => s.field);
  if (!field) return null;
  const heroId = heroIdFor(field.geometry);
  const hero = HERO_FIELDS.find((h) => h.id === heroId);
  const nameKey = `hero.name.${heroId}`;
  if (hero && hasCopy(nameKey)) {
    return { kind: t(`hero.role.${hero.role}`), name: t(nameKey as CopyKey) };
  }
  return {
    kind: t("nav.active.drawn"),
    name: `${formatHectares(field.areaHa)} ${t("map.field.unit.ha")}`,
  };
}
