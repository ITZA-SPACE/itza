import { ProvenanceChip } from "@itza/ui-kit";
import { t } from "../../copy";
import { formatDegrees, formatDistance, formatHectares } from "../../lib/format";
import { useFieldStore } from "../../state";
import { FieldSources } from "./FieldSources";

/**
 * Area, centre and perimeter of the selected field as Figma stat tiles (big number, plain label),
 * each with where it comes from, and how the field's data sources are loading.
 */
export function FieldSummary() {
  const field = useFieldStore((s) => s.field);
  if (!field) return <p className="text-body text-ink-muted">{t("map.field.empty")}</p>;
  const [lon, lat] = field.centroid;
  const perimeter = formatDistance(field.perimeterM);
  const stats = [
    {
      label: t("map.field.area"),
      value: formatHectares(field.areaHa),
      unit: t("map.field.unit.ha"),
    },
    {
      label: t("map.field.perimeter"),
      value: perimeter.value,
      unit: t(perimeter.unit === "km" ? "map.field.unit.km" : "map.field.unit.m"),
    },
    {
      label: t("map.field.centroid"),
      value: `${formatDegrees(lat, t("map.field.north"), t("map.field.south"))}, ${formatDegrees(lon, t("map.field.east"), t("map.field.west"))}`,
      unit: "",
    },
  ];
  return (
    <section
      aria-labelledby="field-summary-title"
      className="glass-panel @container space-y-4 rounded-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="field-summary-title" className="text-title font-semibold text-ink">
          {t("map.field.title")}
        </h2>
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
      </div>
      <dl className="grid grid-cols-2 gap-3 @xl:grid-cols-[auto_auto_1fr]">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`flex min-w-0 flex-col-reverse gap-1 rounded-panel border border-line-soft bg-glass px-4 py-3 ${i === 2 ? "col-span-2 @xl:col-span-1" : ""}`}
          >
            <dt className="text-caption text-ink-muted">{stat.label}</dt>
            <dd className="truncate font-display text-title font-bold text-ink tabular-nums">
              {stat.value}
              {stat.unit ? (
                <span className="ml-1 text-body font-medium text-ink-muted">{stat.unit}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <FieldSources />
    </section>
  );
}
