import { Button, ProvenanceChip } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { Box } from "lucide-react";
import { t } from "../../copy";
import { formatDegrees, formatDistance, formatHectares } from "../../lib/format";
import { useFieldStore } from "../../state";
import { useActiveField } from "../shell/useActiveField";
import { FieldSources } from "./FieldSources";

/**
 * Figma "Field summary": the field's name, two big numbers, the 3D view, and where the outline and
 * data come from (folded into one chip and one status line).
 */
export function FieldSummary() {
  const field = useFieldStore((s) => s.field);
  const active = useActiveField();
  if (!field || !active) return null;
  const [lon, lat] = field.centroid;
  const perimeter = formatDistance(field.perimeterM);
  const stats = [
    { value: formatHectares(field.areaHa), label: t("map.field.unit.hectares") },
    {
      value: perimeter.value,
      label: t(
        perimeter.unit === "km" ? "map.field.unit.kmPerimeter" : "map.field.unit.mPerimeter",
      ),
    },
  ];
  return (
    <section
      aria-labelledby="field-summary-title"
      className="glass-panel space-y-4 rounded-card p-5"
    >
      <div className="space-y-0.5">
        <h2
          id="field-summary-title"
          className="font-display text-[1.5rem] leading-8 font-bold text-ink"
        >
          {active.name}
        </h2>
        <p className="text-caption text-ink-muted">
          {active.kind} ·{" "}
          {`${formatDegrees(lat, t("map.field.north"), t("map.field.south"))}, ${formatDegrees(lon, t("map.field.east"), t("map.field.west"))}`}
        </p>
      </div>
      <dl className="flex gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse">
            <dt className="text-caption text-ink-muted">{stat.label}</dt>
            <dd className="font-display text-[2.5rem] leading-[3rem] font-bold text-ink tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button asChild variant="premium" className="w-full">
        <Link to="/twin">
          <Box aria-hidden />
          {t("twin.open")}
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldSources />
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
    </section>
  );
}
