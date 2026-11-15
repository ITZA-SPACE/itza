import { PageHeader } from "../app/shell/PageHeader";
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-3 pb-12">
      <PageHeader title={t("twin.title")} {...(field ? {} : { subtitle: t("twin.demo") })} />
      {geometry ? <FieldTwin geometry={geometry} /> : null}
    </div>
  );
}
