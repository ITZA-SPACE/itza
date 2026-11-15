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
    <section aria-labelledby="field-summary-title" className="space-y-2 lg:space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2
            id="field-summary-title"
            className="truncate font-display text-title leading-7 font-bold text-ink"
          >
            {active.name}
          </h2>
          {/* Phones already name the field in the top switcher. */}
          <p className="hidden truncate text-caption text-ink-muted lg:block">{active.kind}</p>
        </div>
        <FieldSources />
      </div>
      {/* Phones: the two numbers and Next share one row, so the card leaves the map visible. */}
      <div className="flex items-end justify-between gap-3 lg:block lg:space-y-3">
        <dl className="flex gap-5 lg:gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse">
              <dt className="text-caption text-ink-muted">{stat.label}</dt>
              <dd className="font-display text-[1.625rem] leading-8 font-bold text-ink tabular-nums lg:text-[2.25rem] lg:leading-10">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <Button asChild className="shrink-0 lg:w-full">
          <Link to="/inputs">
            {t("flow.next")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
