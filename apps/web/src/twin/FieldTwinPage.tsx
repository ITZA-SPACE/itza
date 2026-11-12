import { t } from "../copy";
import { HERO_FIELDS } from "../data/hero";
import { useFieldStore } from "../state";
import { FieldTwin } from "./FieldTwin";

const DEMO_FIELD = HERO_FIELDS[0]?.geometry;

/** The 3D view of the selected field, or of a demo field when none is selected. */
export function FieldTwinPage() {
  const field = useFieldStore((s) => s.field);
  const geometry = field?.geometry ?? DEMO_FIELD;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <h1 className="text-title font-semibold text-ink">{t("twin.title")}</h1>
      {field ? null : <p className="text-caption text-ink-muted">{t("twin.demo")}</p>}
      {geometry ? <FieldTwin geometry={geometry} /> : null}
    </div>
  );
}
