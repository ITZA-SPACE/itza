import { Button } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { t } from "../../copy";
import { formatDistance, formatHectares } from "../../lib/format";
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
    <section aria-labelledby="field-summary-title" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2
            id="field-summary-title"
            className="truncate font-display text-title leading-7 font-bold text-ink"
          >
            {active.name}
          </h2>
          <p className="truncate text-caption text-ink-muted">{active.kind}</p>
        </div>
        <FieldSources />
      </div>
      <dl className="flex gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse">
            <dt className="text-caption text-ink-muted">{stat.label}</dt>
            <dd className="font-display text-[2.25rem] leading-10 font-bold text-ink tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button asChild className="w-full">
        <Link to="/inputs">
          {t("flow.next")}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </section>
  );
}
