import { ProvenanceChip } from "@itza/ui-kit";
import { t } from "../../copy";
import { formatDegrees, formatDistance, formatHectares } from "../../lib/format";
import { useFieldStore } from "../../state";
import { FieldSources } from "./FieldSources";

/** Area, centre and perimeter of the selected field, each with where it comes from. */
export function FieldSummary() {
  const field = useFieldStore((s) => s.field);
  if (!field) return <p className="text-body text-ink-muted">{t("map.field.empty")}</p>;
  const [lon, lat] = field.centroid;
  const perimeter = formatDistance(field.perimeterM);
  return (
    <section aria-labelledby="field-summary-title" className="space-y-3">
      <h2 id="field-summary-title" className="text-title font-semibold text-ink">
        {t("map.field.title")}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-ink-muted">{t("map.field.area")}</dt>
        <dd className="font-semibold text-ink">
          {formatHectares(field.areaHa)} {t("map.field.unit.ha")}
        </dd>
        <dt className="text-ink-muted">{t("map.field.centroid")}</dt>
        <dd className="text-ink">
          {formatDegrees(lat, t("map.field.north"), t("map.field.south"))},{" "}
          {formatDegrees(lon, t("map.field.east"), t("map.field.west"))}
        </dd>
        <dt className="text-ink-muted">{t("map.field.perimeter")}</dt>
        <dd className="text-ink">
          {perimeter.value} {t(perimeter.unit === "km" ? "map.field.unit.km" : "map.field.unit.m")}
        </dd>
      </dl>
      <ProvenanceChip
        source={t("map.field.provenance.source")}
        resolution={t("map.field.provenance.resolution")}
        period={t("map.field.provenance.period")}
        labels={{
          source: t("map.field.provenance.label.source"),
          resolution: t("map.field.provenance.label.resolution"),
          period: t("map.field.provenance.label.period"),
        }}
      />
      <FieldSources />
    </section>
  );
}
